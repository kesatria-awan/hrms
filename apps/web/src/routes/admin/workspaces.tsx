import { createFileRoute } from "@tanstack/react-router"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { useState } from "react"
import { formatDistanceToNow } from "date-fns"
import {
  Building2,
  MoreHorizontal,
  Edit,
  Trash2,
  Eye,
  Loader2,
  ChevronLeft,
  ChevronRight,
  Users,
  HardDrive,
  AlertTriangle,
} from "lucide-react"
import { Button } from "@tracky/web/components/ui/button"
import { Badge } from "@tracky/web/components/ui/badge"
import { Input } from "@tracky/web/components/ui/input"
import { Label } from "@tracky/web/components/ui/label"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@tracky/web/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@tracky/web/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@tracky/web/components/ui/dropdown-menu"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@tracky/web/components/ui/alert-dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@tracky/web/components/ui/select"
import { useApi } from "@tracky/web/hooks/use-api"

export const Route = createFileRoute("/admin/workspaces")({
  component: AdminWorkspacesPage,
})

type Workspace = {
  id: string
  name: string
  slug: string
  ownerId: string
  clerkOrgId: string | null
  storageUsedBytes: number
  storageQuotaBytes: number
  billingType: "subscription" | "retainer"
  plan: "free" | "pro"
  subscriptionStatus: "none" | "active" | "cancelling" | "past_due"
  billingPeriodStart: number | null
  billingPeriodEnd: number | null
  cancelledAt: number | null
  memberCount: number
  createdAt: number
  updatedAt: number
  deletedAt: number | null
}

type WorkspaceDetail = Workspace & {
  owner: {
    id: string
    email: string
    firstName: string | null
    lastName: string | null
  } | null
  boardCount: number
  taskCount: number
}

const PAGE_SIZE = 10

function AdminWorkspacesPage() {
  const api = useApi()
  const queryClient = useQueryClient()
  const [page, setPage] = useState(0)
  const [includeDeleted, setIncludeDeleted] = useState(false)
  const [selectedWorkspace, setSelectedWorkspace] = useState<WorkspaceDetail | null>(null)
  const [editWorkspace, setEditWorkspace] = useState<Workspace | null>(null)
  const [editName, setEditName] = useState("")
  const [editStorageQuota, setEditStorageQuota] = useState("")
  const [editBillingType, setEditBillingType] = useState<"subscription" | "retainer">("subscription")
  const [editPlan, setEditPlan] = useState<"free" | "pro">("free")
  const [workspaceToDelete, setWorkspaceToDelete] = useState<Workspace | null>(null)

  // Fetch workspaces
  const { data, isLoading, error } = useQuery({
    queryKey: ["admin", "workspaces", page, includeDeleted],
    queryFn: async () => {
      const response = await api.admin.workspaces.$get({
        query: {
          limit: String(PAGE_SIZE),
          offset: String(page * PAGE_SIZE),
          includeDeleted: String(includeDeleted),
        },
      })
      if (!response.ok) {
        throw new Error("Failed to fetch workspaces")
      }
      return response.json()
    },
  })

  // Fetch workspace details
  const { data: workspaceDetail, isLoading: detailLoading } = useQuery({
    queryKey: ["admin", "workspace", selectedWorkspace?.id],
    queryFn: async () => {
      if (!selectedWorkspace) return null
      const response = await api.admin.workspaces[":id"].$get({
        param: { id: selectedWorkspace.id },
      })
      if (!response.ok) {
        throw new Error("Failed to fetch workspace details")
      }
      return response.json()
    },
    enabled: !!selectedWorkspace,
  })

  // Update workspace mutation
  const updateWorkspace = useMutation({
    mutationFn: async ({ id, name, storageQuotaBytes, billingType, plan }: { id: string; name?: string; storageQuotaBytes?: number; billingType?: "subscription" | "retainer"; plan?: "free" | "pro" }) => {
      const response = await api.admin.workspaces[":id"].$patch({
        param: { id },
        json: { name, storageQuotaBytes, billingType, plan },
      })
      if (!response.ok) {
        const error = await response.json()
        throw new Error((error as { message?: string }).message || "Failed to update workspace")
      }
      return response.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "workspaces"] })
      setEditWorkspace(null)
    },
  })

  // Delete workspace mutation
  const deleteWorkspace = useMutation({
    mutationFn: async (id: string) => {
      const response = await api.admin.workspaces[":id"].$delete({
        param: { id },
      })
      if (!response.ok) {
        const error = await response.json()
        throw new Error((error as { message?: string }).message || "Failed to delete workspace")
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "workspaces"] })
      setWorkspaceToDelete(null)
    },
  })

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return "0 B"
    const k = 1024
    const sizes = ["B", "KB", "MB", "GB", "TB"]
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`
  }

  const handleEditOpen = (workspace: Workspace) => {
    setEditWorkspace(workspace)
    setEditName(workspace.name)
    setEditStorageQuota(String(Math.floor(workspace.storageQuotaBytes / (1024 * 1024 * 1024))))
    setEditBillingType(workspace.billingType)
    setEditPlan(workspace.plan)
  }

  const handleEditSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!editWorkspace) return

    const updates: { name?: string; storageQuotaBytes?: number; billingType?: "subscription" | "retainer"; plan?: "free" | "pro" } = {}
    if (editName !== editWorkspace.name) {
      updates.name = editName
    }
    const newQuotaGB = parseInt(editStorageQuota, 10)
    const newQuotaBytes = newQuotaGB * 1024 * 1024 * 1024
    if (newQuotaBytes !== editWorkspace.storageQuotaBytes) {
      updates.storageQuotaBytes = newQuotaBytes
    }
    if (editBillingType !== editWorkspace.billingType) {
      updates.billingType = editBillingType
    }
    if (editPlan !== editWorkspace.plan) {
      updates.plan = editPlan
    }

    if (Object.keys(updates).length > 0) {
      updateWorkspace.mutate({ id: editWorkspace.id, ...updates })
    } else {
      setEditWorkspace(null)
    }
  }

  const totalPages = Math.ceil((data?.totalCount ?? 0) / PAGE_SIZE)

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <AlertTriangle className="h-12 w-12 text-destructive mx-auto mb-4" />
          <p className="text-destructive mb-4">Failed to load workspaces</p>
          <Button onClick={() => window.location.reload()}>Retry</Button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Workspaces</h1>
          <p className="text-muted-foreground mt-1">
            Manage all workspaces across the platform
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-4">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={includeDeleted}
            onChange={(e) => {
              setIncludeDeleted(e.target.checked)
              setPage(0)
            }}
            className="rounded border-gray-300"
          />
          Include deleted workspaces
        </label>
      </div>

      {/* Workspaces Table */}
      <Card>
        <CardHeader>
          <CardTitle>All Workspaces</CardTitle>
          <CardDescription>
            {data?.totalCount} workspace{data?.totalCount !== 1 ? "s" : ""} total
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {data?.workspaces.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">
              No workspaces found
            </div>
          ) : (
            <div className="divide-y divide-border">
              {data?.workspaces.map((workspace: Workspace) => (
                <div
                  key={workspace.id}
                  className={`flex items-center justify-between p-4 px-6 hover:bg-muted/50 transition-colors ${
                    workspace.deletedAt ? "opacity-50" : ""
                  }`}
                >
                  <div className="flex items-center gap-4">
                    <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                      <Building2 className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{workspace.name}</span>
                        <Badge variant={workspace.plan === "pro" ? "default" : "secondary"} className="text-xs">
                          {workspace.plan === "pro" ? "Pro" : "Free"}
                        </Badge>
                        <Badge variant={workspace.billingType === "retainer" ? "outline" : "secondary"} className="text-xs">
                          {workspace.billingType === "retainer" ? "Retainer" : "Subscription"}
                        </Badge>
                        {workspace.subscriptionStatus === "active" && (
                          <Badge className="text-xs bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">Active</Badge>
                        )}
                        {workspace.subscriptionStatus === "cancelling" && (
                          <Badge variant="secondary" className="text-xs">Cancelling</Badge>
                        )}
                        {workspace.subscriptionStatus === "past_due" && (
                          <Badge variant="destructive" className="text-xs">Past Due</Badge>
                        )}
                        {workspace.deletedAt && (
                          <Badge variant="destructive" className="text-xs">Deleted</Badge>
                        )}
                      </div>
                      <div className="text-sm text-muted-foreground">
                        {workspace.slug}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-8">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Users className="h-4 w-4" />
                      {workspace.memberCount}
                    </div>
                    <div className="flex items-center gap-2 text-sm text-muted-foreground w-32">
                      <HardDrive className="h-4 w-4" />
                      {formatBytes(workspace.storageUsedBytes)}
                    </div>
                    <span className="text-sm text-muted-foreground w-32">
                      {formatDistanceToNow(new Date(workspace.createdAt), { addSuffix: true })}
                    </span>

                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => setSelectedWorkspace(workspace as WorkspaceDetail)}>
                          <Eye className="mr-2 h-4 w-4" />
                          View Details
                        </DropdownMenuItem>
                        {!workspace.deletedAt && (
                          <>
                            <DropdownMenuItem onClick={() => handleEditOpen(workspace)}>
                              <Edit className="mr-2 h-4 w-4" />
                              Edit
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              className="text-destructive focus:text-destructive"
                              onClick={() => setWorkspaceToDelete(workspace)}
                            >
                              <Trash2 className="mr-2 h-4 w-4" />
                              Delete
                            </DropdownMenuItem>
                          </>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between p-4 border-t">
              <p className="text-sm text-muted-foreground">
                Showing {page * PAGE_SIZE + 1} to {Math.min((page + 1) * PAGE_SIZE, data?.totalCount ?? 0)} of {data?.totalCount} workspaces
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage(p => p - 1)}
                  disabled={page === 0}
                >
                  <ChevronLeft className="h-4 w-4 mr-1" />
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage(p => p + 1)}
                  disabled={page >= totalPages - 1}
                >
                  Next
                  <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* View Details Dialog */}
      <Dialog open={!!selectedWorkspace} onOpenChange={(open) => !open && setSelectedWorkspace(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Workspace Details</DialogTitle>
            <DialogDescription>
              Detailed information about this workspace
            </DialogDescription>
          </DialogHeader>
          {detailLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : workspaceDetail ? (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-muted-foreground">Name</Label>
                  <p className="font-medium">{workspaceDetail.name}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground">Slug</Label>
                  <p className="font-medium">{workspaceDetail.slug}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground">Owner</Label>
                  <p className="font-medium">
                    {workspaceDetail.owner
                      ? `${workspaceDetail.owner.firstName || ""} ${workspaceDetail.owner.lastName || ""}`.trim() || workspaceDetail.owner.email
                      : "Unknown"}
                  </p>
                </div>
                <div>
                  <Label className="text-muted-foreground">Members</Label>
                  <p className="font-medium">{workspaceDetail.memberCount}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground">Boards</Label>
                  <p className="font-medium">{workspaceDetail.boardCount}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground">Tasks</Label>
                  <p className="font-medium">{workspaceDetail.taskCount}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground">Plan</Label>
                  <p className="font-medium">
                    <Badge variant={workspaceDetail.plan === "pro" ? "default" : "secondary"} className="text-xs">
                      {workspaceDetail.plan === "pro" ? "Pro" : "Free"}
                    </Badge>
                  </p>
                </div>
                <div>
                  <Label className="text-muted-foreground">Billing Type</Label>
                  <p className="font-medium">
                    <Badge variant={workspaceDetail.billingType === "retainer" ? "outline" : "secondary"} className="text-xs">
                      {workspaceDetail.billingType === "retainer" ? "Retainer" : "Subscription"}
                    </Badge>
                  </p>
                </div>
                <div>
                  <Label className="text-muted-foreground">Subscription</Label>
                  <p className="font-medium">
                    {workspaceDetail.subscriptionStatus === "active" && (
                      <Badge className="text-xs bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">Active</Badge>
                    )}
                    {workspaceDetail.subscriptionStatus === "cancelling" && (
                      <Badge variant="secondary" className="text-xs">Cancelling</Badge>
                    )}
                    {workspaceDetail.subscriptionStatus === "past_due" && (
                      <Badge variant="destructive" className="text-xs">Past Due</Badge>
                    )}
                    {workspaceDetail.subscriptionStatus === "none" && (
                      <Badge variant="outline" className="text-xs">None</Badge>
                    )}
                  </p>
                </div>
                {workspaceDetail.billingPeriodEnd && (
                  <div>
                    <Label className="text-muted-foreground">Billing Period End</Label>
                    <p className="font-medium">
                      {new Date(workspaceDetail.billingPeriodEnd).toLocaleDateString()}
                    </p>
                  </div>
                )}
                <div>
                  <Label className="text-muted-foreground">Storage Used</Label>
                  <p className="font-medium">{formatBytes(workspaceDetail.storageUsedBytes)}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground">Storage Quota</Label>
                  <p className="font-medium">{formatBytes(workspaceDetail.storageQuotaBytes)}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground">Created</Label>
                  <p className="font-medium">
                    {formatDistanceToNow(new Date(workspaceDetail.createdAt), { addSuffix: true })}
                  </p>
                </div>
                {workspaceDetail.deletedAt && (
                  <div>
                    <Label className="text-muted-foreground">Deleted</Label>
                    <p className="font-medium text-destructive">
                      {formatDistanceToNow(new Date(workspaceDetail.deletedAt), { addSuffix: true })}
                    </p>
                  </div>
                )}
              </div>
            </div>
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setSelectedWorkspace(null)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={!!editWorkspace} onOpenChange={(open) => !open && setEditWorkspace(null)}>
        <DialogContent>
          <form onSubmit={handleEditSubmit}>
            <DialogHeader>
              <DialogTitle>Edit Workspace</DialogTitle>
              <DialogDescription>
                Update workspace settings
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="name">Name</Label>
                <Input
                  id="name"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  placeholder="Workspace name"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="quota">Storage Quota (GB)</Label>
                <Input
                  id="quota"
                  type="number"
                  min="1"
                  value={editStorageQuota}
                  onChange={(e) => setEditStorageQuota(e.target.value)}
                  placeholder="Storage quota in GB"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="plan">Plan</Label>
                <Select value={editPlan} onValueChange={(value: "free" | "pro") => setEditPlan(value)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="free">Free</SelectItem>
                    <SelectItem value="pro">Pro</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Changing the plan will also update the storage quota automatically.
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="billingType">Billing Type</Label>
                <Select value={editBillingType} onValueChange={(value: "subscription" | "retainer") => setEditBillingType(value)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="subscription">Subscription</SelectItem>
                    <SelectItem value="retainer">Retainer</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setEditWorkspace(null)}>
                Cancel
              </Button>
              <Button type="submit" disabled={updateWorkspace.isPending}>
                {updateWorkspace.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Save Changes
              </Button>
            </DialogFooter>
            {updateWorkspace.isError && (
              <p className="text-sm text-destructive mt-2">{updateWorkspace.error.message}</p>
            )}
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!workspaceToDelete} onOpenChange={(open) => !open && setWorkspaceToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Workspace</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete <strong>{workspaceToDelete?.name}</strong>?
              This action will soft-delete the workspace and all its data.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => workspaceToDelete && deleteWorkspace.mutate(workspaceToDelete.id)}
              disabled={deleteWorkspace.isPending}
            >
              {deleteWorkspace.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Delete Workspace
            </AlertDialogAction>
          </AlertDialogFooter>
          {deleteWorkspace.isError && (
            <p className="text-sm text-destructive mt-2">{deleteWorkspace.error.message}</p>
          )}
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
