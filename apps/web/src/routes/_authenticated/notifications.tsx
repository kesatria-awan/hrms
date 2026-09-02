import { createFileRoute } from "@tanstack/react-router"
import { Button } from "@tracky/web/components/ui/button"
import { Badge } from "@tracky/web/components/ui/badge"
import { Card } from "@tracky/web/components/ui/card"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@tracky/web/components/ui/select"
import { useState } from "react"
import { Switch } from "@tracky/web/components/ui/switch"
import { Bell, Loader2, Check, CheckCheck } from "lucide-react"
import { formatDistanceToNow } from "date-fns"
import {
  useNotifications,
  useUnreadCount,
  useMarkNotificationRead,
  useMarkAllNotificationsRead,
  type Notification,
  type NotificationType,
} from "@tracky/web/hooks/use-notifications"

export const Route = createFileRoute("/_authenticated/notifications")({
  component: NotificationsPage,
})

function NotificationsPage() {
  const [activeTab, setActiveTab] = useState("feed")
  const { data: unreadCountData } = useUnreadCount()
  const unreadCount = unreadCountData?.count ?? 0

  return (
    <div className="h-full flex flex-col animate-in fade-in duration-500 -m-6">
      {/* Header section */}
      <div className="bg-background border-b border-border px-8 py-6 shrink-0 space-y-6">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold tracking-tight">Notifications</h1>
          {unreadCount > 0 && (
            <Badge variant="destructive" className="rounded-full px-2.5 py-0.5 text-xs font-normal">
              {unreadCount} new
            </Badge>
          )}
        </div>

        <div className="flex items-center gap-8 border-b border-transparent">
          <TabButton
            active={activeTab === "feed"}
            onClick={() => setActiveTab("feed")}
          >
            Notifications Feed
          </TabButton>
          <TabButton
            active={activeTab === "settings"}
            onClick={() => setActiveTab("settings")}
          >
            Notification Settings
          </TabButton>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 min-h-0 bg-muted/20 p-8 overflow-y-auto">
        {activeTab === "feed" ? <NotificationsFeed /> : <NotificationSettings />}
      </div>
    </div>
  )
}

function NotificationsFeed() {
  const [typeFilter, setTypeFilter] = useState<string>("all")
  const [statusFilter, setStatusFilter] = useState<string>("all")
  const [offset, setOffset] = useState(0)
  const [markingReadId, setMarkingReadId] = useState<string | null>(null)
  const limit = 10

  const { data: notifications, isLoading, error } = useNotifications({ limit, offset })
  const markAsRead = useMarkNotificationRead()
  const markAllAsRead = useMarkAllNotificationsRead()

  const handleMarkAsRead = (notificationId: string) => {
    setMarkingReadId(notificationId)
    markAsRead.mutate(notificationId, {
      onSettled: () => setMarkingReadId(null),
    })
  }

  const handleMarkAllAsRead = () => {
    markAllAsRead.mutate()
  }

  // Filter notifications client-side
  const filteredNotifications = notifications?.filter((n) => {
    if (typeFilter !== "all" && n.type !== typeFilter) return false
    if (statusFilter === "unread" && n.isRead) return false
    if (statusFilter === "read" && !n.isRead) return false
    return true
  })

  const hasMore = notifications?.length === limit

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Toolbar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-[140px] bg-background">
              <SelectValue placeholder="All Types" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              <SelectItem value="mention">Mentions</SelectItem>
              <SelectItem value="assignment">Assignments</SelectItem>
              <SelectItem value="due_date">Due Dates</SelectItem>
              <SelectItem value="task_overdue">Overdue</SelectItem>
            </SelectContent>
          </Select>

          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[120px] bg-background">
              <SelectValue placeholder="All Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="unread">Unread</SelectItem>
              <SelectItem value="read">Read</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <Button
          variant="outline"
          className="text-sm"
          onClick={handleMarkAllAsRead}
          disabled={markAllAsRead.isPending}
        >
          {markAllAsRead.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin mr-2" />
          ) : (
            <CheckCheck className="h-4 w-4 mr-2" />
          )}
          Mark all as read
        </Button>
      </div>

      {/* Loading State */}
      {isLoading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      )}

      {/* Error State */}
      {error && (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <p className="text-destructive mb-4">Failed to load notifications</p>
          <Button onClick={() => window.location.reload()}>Retry</Button>
        </div>
      )}

      {/* Empty State */}
      {!isLoading && !error && filteredNotifications?.length === 0 && (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <Bell className="h-12 w-12 text-muted-foreground/50 mb-4" />
          <h3 className="text-lg font-medium mb-1">No notifications</h3>
          <p className="text-sm text-muted-foreground">
            {statusFilter !== "all" || typeFilter !== "all"
              ? "Try adjusting your filters"
              : "You're all caught up!"}
          </p>
        </div>
      )}

      {/* Feed Items */}
      {!isLoading && !error && filteredNotifications && filteredNotifications.length > 0 && (
        <div className="space-y-4">
          {filteredNotifications.map((item) => (
            <NotificationCard
              key={item.id}
              notification={item}
              onMarkAsRead={handleMarkAsRead}
              isMarkingAsRead={markingReadId === item.id}
            />
          ))}
        </div>
      )}

      {/* Pagination */}
      {!isLoading && !error && (notifications?.length ?? 0) > 0 && (
        <div className="flex justify-center gap-2 pt-4">
          {offset > 0 && (
            <Button
              variant="outline"
              className="bg-background"
              onClick={() => setOffset(Math.max(0, offset - limit))}
            >
              Previous
            </Button>
          )}
          {hasMore && (
            <Button
              variant="outline"
              className="bg-background"
              onClick={() => setOffset(offset + limit)}
            >
              Load more
            </Button>
          )}
        </div>
      )}
    </div>
  )
}

function NotificationCard({
  notification,
  onMarkAsRead,
  isMarkingAsRead,
}: {
  notification: Notification
  onMarkAsRead: (id: string) => void
  isMarkingAsRead: boolean
}) {
  const timeAgo = formatDistanceToNow(new Date(notification.createdAt), { addSuffix: true })

  return (
    <Card className="p-6 flex gap-4 transition-all hover:shadow-md border-border/60">
      {/* Unread Indicator */}
      <div className="pt-2">
        <div
          className={`h-2.5 w-2.5 rounded-full ${
            !notification.isRead ? "bg-red-500" : "bg-transparent"
          }`}
        />
      </div>

      <div className="flex-1 space-y-4">
        {/* Header Row */}
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <NotificationTypeBadge type={notification.type} />
            <h3 className="text-base font-semibold">{notification.title}</h3>
            {notification.body && (
              <p className="text-sm text-muted-foreground">"{notification.body}"</p>
            )}
          </div>
          <span className="text-xs text-muted-foreground whitespace-nowrap">{timeAgo}</span>
        </div>

        {/* Context Row */}
        <div className="flex items-center flex-wrap gap-x-8 gap-y-2 text-sm">
          {notification.resourceType && (
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">Resource:</span>
              <span className="font-medium capitalize">{notification.resourceType}</span>
            </div>
          )}
        </div>

        {/* Actions Row */}
        <div className="flex items-center gap-3 pt-1">
          {notification.resourceId && notification.resourceType === "task" && (
            <Button
              size="sm"
              variant="secondary"
              className="h-8 px-4 font-normal"
              disabled
              title="Task navigation coming soon"
            >
              Open Task
            </Button>
          )}
          {notification.resourceId && notification.resourceType === "comment" && (
            <Button
              size="sm"
              variant="secondary"
              className="h-8 px-4 font-normal"
              disabled
              title="Comment navigation coming soon"
            >
              View Comment
            </Button>
          )}
          {!notification.isRead && (
            <Button
              size="sm"
              variant="outline"
              className="h-8 px-4 font-normal"
              onClick={() => onMarkAsRead(notification.id)}
              disabled={isMarkingAsRead}
            >
              {isMarkingAsRead ? (
                <Loader2 className="h-3 w-3 animate-spin mr-1" />
              ) : (
                <Check className="h-3 w-3 mr-1" />
              )}
              Mark as read
            </Button>
          )}
        </div>
      </div>
    </Card>
  )
}

function NotificationSettings() {
  return (
    <div className="max-w-2xl mx-auto">
      <Card className="p-8 space-y-8">
        <div>
          <h3 className="text-lg font-semibold mb-1">Email Notifications</h3>
          <p className="text-sm text-muted-foreground mb-4">
            Choose what updates you want to receive via email.
          </p>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium">Mentions</label>
              <Switch defaultChecked />
            </div>
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium">Assignments</label>
              <Switch defaultChecked />
            </div>
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium">Due Date Reminders</label>
              <Switch defaultChecked />
            </div>
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium">Daily Summary</label>
              <Switch />
            </div>
          </div>
        </div>

        <div className="pt-6 border-t border-border">
          <h3 className="text-lg font-semibold mb-1">Push Notifications</h3>
          <p className="text-sm text-muted-foreground mb-4">
            Manage your browser and mobile push notifications.
          </p>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium">All Activity</label>
              <Switch defaultChecked />
            </div>
          </div>
        </div>
      </Card>
    </div>
  )
}

/** HELPER COMPONENTS */

function TabButton({
  children,
  active,
  onClick,
}: {
  children: React.ReactNode
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={`pb-3 text-sm font-semibold border-b-[3px] transition-all ${
        active
          ? "border-primary text-foreground"
          : "border-transparent text-muted-foreground hover:text-foreground"
      }`}
    >
      {children}
    </button>
  )
}

function NotificationTypeBadge({ type }: { type: NotificationType }) {
  const styles: Record<NotificationType, string> = {
    mention: "bg-rose-100 text-rose-600",
    assignment: "bg-blue-100 text-blue-600",
    due_date: "bg-amber-100 text-amber-700",
    task_overdue: "bg-red-100 text-red-700",
  }

  const labels: Record<NotificationType, string> = {
    mention: "Mention",
    assignment: "Assignment",
    due_date: "Due Date",
    task_overdue: "Overdue",
  }

  return (
    <span
      className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] uppercase font-bold tracking-wide mb-1 ${styles[type]}`}
    >
      {labels[type]}
    </span>
  )
}
