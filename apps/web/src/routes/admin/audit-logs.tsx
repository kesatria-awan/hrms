import { createFileRoute } from "@tanstack/react-router"
import { useQuery } from "@tanstack/react-query"
import { useState } from "react"
import { formatDistanceToNow, format } from "date-fns"
import {
  ScrollText,
  Loader2,
  ChevronLeft,
  ChevronRight,
  Filter,
  X,
  AlertTriangle,
  Building2,
  Eye,
  Edit,
  Trash2,
  Users,
} from "lucide-react"
import { Button } from "@tracky/web/components/ui/button"
import { Badge } from "@tracky/web/components/ui/badge"
import { Label } from "@tracky/web/components/ui/label"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@tracky/web/components/ui/card"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@tracky/web/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@tracky/web/components/ui/dialog"
import { useApi } from "@tracky/web/hooks/use-api"

export const Route = createFileRoute("/admin/audit-logs")({
  component: AdminAuditLogsPage,
})

type AuditLog = {
  id: string
  actorId: string
  actor: {
    id: string
    email: string
    firstName: string | null
    lastName: string | null
  } | null
  workspaceId: string | null
  action: string
  resourceType: string
  resourceId: string | null
  metadata: Record<string, unknown> | null
  ipAddress: string | null
  userAgent: string | null
  createdAt: number
}

const PAGE_SIZE = 20

const ACTION_OPTIONS = [
  { value: "all", label: "All Actions" },
  { value: "workspace_updated", label: "Workspace Updated" },
  { value: "workspace_deleted", label: "Workspace Deleted" },
]

function AdminAuditLogsPage() {
  const api = useApi()
  const [page, setPage] = useState(0)
  const [actionFilter, setActionFilter] = useState("all")
  const [selectedLog, setSelectedLog] = useState<AuditLog | null>(null)

  // Fetch audit logs
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["admin", "audit-logs", page, actionFilter],
    queryFn: async () => {
      const query: Record<string, string> = {
        limit: String(PAGE_SIZE),
        offset: String(page * PAGE_SIZE),
      }
      if (actionFilter !== "all") {
        query.action = actionFilter
      }
      const response = await api.admin["audit-logs"].$get({ query })
      if (!response.ok) {
        throw new Error("Failed to fetch audit logs")
      }
      return response.json()
    },
  })

  const getActionIcon = (action: string) => {
    if (action.includes("viewed") || action.includes("listed")) {
      return <Eye className="h-4 w-4" />
    }
    if (action.includes("updated")) {
      return <Edit className="h-4 w-4" />
    }
    if (action.includes("deleted")) {
      return <Trash2 className="h-4 w-4" />
    }
    return <ScrollText className="h-4 w-4" />
  }

  const getActionColor = (action: string) => {
    if (action.includes("deleted")) {
      return "bg-destructive/10 text-destructive"
    }
    if (action.includes("updated")) {
      return "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
    }
    return "bg-muted text-muted-foreground"
  }

  const getResourceIcon = (resourceType: string) => {
    switch (resourceType) {
      case "workspace":
        return <Building2 className="h-4 w-4" />
      case "user":
        return <Users className="h-4 w-4" />
      case "audit_log":
        return <ScrollText className="h-4 w-4" />
      default:
        return <ScrollText className="h-4 w-4" />
    }
  }

  const formatActionLabel = (action: string) => {
    return action
      .split("_")
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ")
  }

  const getActorName = (actor: AuditLog["actor"]) => {
    if (!actor) return "Unknown"
    if (actor.firstName || actor.lastName) {
      return `${actor.firstName || ""} ${actor.lastName || ""}`.trim()
    }
    return actor.email.split("@")[0]
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
          <p className="text-destructive mb-4">Failed to load audit logs</p>
          <Button onClick={() => refetch()}>Retry</Button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Audit Logs</h1>
          <p className="text-muted-foreground mt-1">
            Track all administrative actions on the platform
          </p>
        </div>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="text-base flex items-center gap-2">
            <Filter className="h-4 w-4" />
            Filters
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-center gap-4">
            <div className="w-48">
              <Label className="text-xs text-muted-foreground mb-1 block">Action Type</Label>
              <Select
                value={actionFilter}
                onValueChange={(value) => {
                  setActionFilter(value)
                  setPage(0)
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ACTION_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {actionFilter !== "all" && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setActionFilter("all")
                  setPage(0)
                }}
                className="mt-5"
              >
                <X className="h-4 w-4 mr-1" />
                Clear Filters
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Audit Logs Table */}
      <Card>
        <CardHeader>
          <CardTitle>Activity Log</CardTitle>
          <CardDescription>
            {data?.totalCount} log entr{data?.totalCount !== 1 ? "ies" : "y"} total
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {data?.auditLogs.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">
              No audit logs found
            </div>
          ) : (
            <div className="divide-y divide-border">
              {data?.auditLogs.map((log: AuditLog) => (
                <div
                  key={log.id}
                  role="button"
                  tabIndex={0}
                  aria-label={`View details for ${formatActionLabel(log.action)} by ${getActorName(log.actor)}`}
                  className="flex items-center justify-between p-4 px-6 hover:bg-muted/50 focus:bg-muted/50 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-inset transition-colors cursor-pointer"
                  onClick={() => setSelectedLog(log)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault()
                      setSelectedLog(log)
                    }
                  }}
                >
                  <div className="flex items-center gap-4">
                    <div className={`h-10 w-10 rounded-lg flex items-center justify-center ${getActionColor(log.action)}`}>
                      {getActionIcon(log.action)}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{getActorName(log.actor)}</span>
                        <span className="text-muted-foreground">performed</span>
                        <Badge variant="outline" className="font-normal">
                          {formatActionLabel(log.action)}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-2 text-sm text-muted-foreground mt-1">
                        <span className="flex items-center gap-1">
                          {getResourceIcon(log.resourceType)}
                          {log.resourceType}
                        </span>
                        {log.resourceId && (
                          <>
                            <span>•</span>
                            <span className="font-mono text-xs">{log.resourceId.slice(0, 8)}...</span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-4">
                    {log.ipAddress && (
                      <span className="text-sm text-muted-foreground font-mono">
                        {log.ipAddress}
                      </span>
                    )}
                    <span className="text-sm text-muted-foreground w-32 text-right">
                      {formatDistanceToNow(new Date(log.createdAt), { addSuffix: true })}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between p-4 border-t">
              <p className="text-sm text-muted-foreground">
                Showing {page * PAGE_SIZE + 1} to {Math.min((page + 1) * PAGE_SIZE, data?.totalCount ?? 0)} of {data?.totalCount} entries
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

      {/* Log Details Dialog */}
      <Dialog open={!!selectedLog} onOpenChange={(open) => !open && setSelectedLog(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Audit Log Details</DialogTitle>
            <DialogDescription>
              Complete information about this action
            </DialogDescription>
          </DialogHeader>
          {selectedLog && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-muted-foreground">Action</Label>
                  <p className="font-medium">{formatActionLabel(selectedLog.action)}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground">Resource Type</Label>
                  <p className="font-medium capitalize">{selectedLog.resourceType}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground">Actor</Label>
                  <p className="font-medium">{getActorName(selectedLog.actor)}</p>
                  {selectedLog.actor?.email && (
                    <p className="text-sm text-muted-foreground">{selectedLog.actor.email}</p>
                  )}
                </div>
                <div>
                  <Label className="text-muted-foreground">Timestamp</Label>
                  <p className="font-medium">
                    {format(new Date(selectedLog.createdAt), "PPpp")}
                  </p>
                </div>
                {selectedLog.resourceId && (
                  <div className="col-span-2">
                    <Label className="text-muted-foreground">Resource ID</Label>
                    <p className="font-mono text-sm">{selectedLog.resourceId}</p>
                  </div>
                )}
                {selectedLog.workspaceId && (
                  <div className="col-span-2">
                    <Label className="text-muted-foreground">Workspace ID</Label>
                    <p className="font-mono text-sm">{selectedLog.workspaceId}</p>
                  </div>
                )}
                {selectedLog.ipAddress && (
                  <div>
                    <Label className="text-muted-foreground">IP Address</Label>
                    <p className="font-mono text-sm">{selectedLog.ipAddress}</p>
                  </div>
                )}
                {selectedLog.userAgent && (
                  <div className="col-span-2">
                    <Label className="text-muted-foreground">User Agent</Label>
                    <p className="text-sm text-muted-foreground break-all">{selectedLog.userAgent}</p>
                  </div>
                )}
              </div>

              {selectedLog.metadata && Object.keys(selectedLog.metadata).length > 0 && (
                <div>
                  <Label className="text-muted-foreground">Metadata</Label>
                  <pre className="mt-2 p-3 bg-muted rounded-md text-xs overflow-auto max-h-48">
                    {JSON.stringify(selectedLog.metadata, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setSelectedLog(null)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
