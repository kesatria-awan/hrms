import { createFileRoute } from "@tanstack/react-router"
import { useQuery } from "@tanstack/react-query"
import {
  Building2,
  Users,
  HardDrive,
  ScrollText,
  Loader2,
  AlertTriangle,
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@tracky/web/components/ui/card"
import { Button } from "@tracky/web/components/ui/button"
import { useApi } from "@tracky/web/hooks/use-api"
import { formatDistanceToNow } from "date-fns"

export const Route = createFileRoute("/admin/")({
  component: AdminDashboard,
})

type Workspace = {
  id: string
  name: string
  memberCount: number
  storageUsedBytes: number
  createdAt: number
}

type AuditLog = {
  id: string
  actor: {
    firstName: string | null
    email: string
  } | null
  action: string
  createdAt: number
}

function AdminDashboard() {
  const api = useApi()

  // Fetch workspaces for stats
  const { data: workspacesData, isLoading: workspacesLoading, isError: workspacesError, refetch: refetchWorkspaces } = useQuery({
    queryKey: ["admin", "workspaces"],
    queryFn: async () => {
      const response = await api.admin.workspaces.$get({
        query: { limit: "100" },
      })
      if (!response.ok) {
        throw new Error("Failed to fetch workspaces")
      }
      return response.json()
    },
  })

  // Fetch users for stats
  const { data: usersData, isLoading: usersLoading, isError: usersError, refetch: refetchUsers } = useQuery({
    queryKey: ["admin", "users"],
    queryFn: async () => {
      const response = await api.admin.users.$get({
        query: { limit: "100" },
      })
      if (!response.ok) {
        throw new Error("Failed to fetch users")
      }
      return response.json()
    },
  })

  // Fetch recent audit logs
  const { data: auditLogsData, isLoading: auditLogsLoading, isError: auditLogsError, refetch: refetchAuditLogs } = useQuery({
    queryKey: ["admin", "audit-logs", "recent"],
    queryFn: async () => {
      const response = await api.admin["audit-logs"].$get({
        query: { limit: "10" },
      })
      if (!response.ok) {
        throw new Error("Failed to fetch audit logs")
      }
      return response.json()
    },
  })

  const isLoading = workspacesLoading || usersLoading || auditLogsLoading
  const isError = workspacesError || usersError || auditLogsError

  const handleRetry = () => {
    if (workspacesError) refetchWorkspaces()
    if (usersError) refetchUsers()
    if (auditLogsError) refetchAuditLogs()
  }

  // Calculate stats
  const workspaceCount = workspacesData?.totalCount ?? 0
  const userCount = usersData?.totalCount ?? 0
  const totalStorageUsed = workspacesData?.workspaces.reduce(
    (acc: number, ws: { storageUsedBytes: number }) => acc + ws.storageUsedBytes,
    0
  ) ?? 0
  // Storage calculation is limited to first 100 workspaces
  const isStoragePartial = (workspacesData?.totalCount ?? 0) > 100

  const formatBytes = (bytes: number) => {
    if (bytes <= 0 || !Number.isFinite(bytes)) return "0 B"
    const k = 1024
    const sizes = ["B", "KB", "MB", "GB", "TB"]
    const i = Math.min(Math.floor(Math.log(bytes) / Math.log(k)), sizes.length - 1)
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`
  }

  const formatActionLabel = (action: string) => {
    return action
      .split("_")
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ")
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (isError) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <AlertTriangle className="h-12 w-12 text-destructive mx-auto mb-4" />
          <p className="text-destructive mb-4">Failed to load dashboard data</p>
          <Button onClick={handleRetry}>Retry</Button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Admin Dashboard</h1>
        <p className="text-muted-foreground mt-1">
          Platform overview and statistics
        </p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center">
                <Building2 className="h-6 w-6 text-primary" />
              </div>
              <div>
                <p className="text-3xl font-bold">{workspaceCount}</p>
                <p className="text-sm text-muted-foreground">Total Workspaces</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="h-12 w-12 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                <Users className="h-6 w-6 text-blue-600" />
              </div>
              <div>
                <p className="text-3xl font-bold">{userCount}</p>
                <p className="text-sm text-muted-foreground">Total Users</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="h-12 w-12 rounded-lg bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
                <HardDrive className="h-6 w-6 text-amber-600" />
              </div>
              <div>
                <p className="text-3xl font-bold">
                  {isStoragePartial && "~"}{formatBytes(totalStorageUsed)}
                </p>
                <p className="text-sm text-muted-foreground">
                  Storage Used{isStoragePartial && " (partial)"}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="h-12 w-12 rounded-lg bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                <ScrollText className="h-6 w-6 text-green-600" />
              </div>
              <div>
                <p className="text-3xl font-bold">{auditLogsData?.totalCount ?? 0}</p>
                <p className="text-sm text-muted-foreground">Audit Log Entries</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Workspaces */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Recent Workspaces</CardTitle>
            <CardDescription>Latest workspaces created on the platform</CardDescription>
          </CardHeader>
          <CardContent>
            {workspacesData?.workspaces.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">
                No workspaces yet
              </p>
            ) : (
              <div className="space-y-4">
                {workspacesData?.workspaces.slice(0, 5).map((workspace: Workspace) => (
                  <div key={workspace.id} className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                        <Building2 className="h-5 w-5 text-primary" />
                      </div>
                      <div>
                        <p className="font-medium">{workspace.name}</p>
                        <p className="text-sm text-muted-foreground">
                          {workspace.memberCount} member{workspace.memberCount !== 1 ? "s" : ""}
                        </p>
                      </div>
                    </div>
                    <span className="text-sm text-muted-foreground">
                      {formatDistanceToNow(new Date(workspace.createdAt), { addSuffix: true })}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Recent Audit Logs */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Recent Activity</CardTitle>
            <CardDescription>Latest admin actions on the platform</CardDescription>
          </CardHeader>
          <CardContent>
            {auditLogsData?.auditLogs.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">
                No activity yet
              </p>
            ) : (
              <div className="space-y-4">
                {auditLogsData?.auditLogs.slice(0, 5).map((log: AuditLog) => (
                  <div key={log.id} className="flex items-start gap-3">
                    <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center shrink-0">
                      <ScrollText className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm">
                        <span className="font-medium">
                          {log.actor?.firstName || log.actor?.email?.split("@")[0] || "Unknown"}
                        </span>{" "}
                        <span className="text-muted-foreground">
                          {formatActionLabel(log.action).toLowerCase()}
                        </span>
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {formatDistanceToNow(new Date(log.createdAt), { addSuffix: true })}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
