import { Bell, Check, CheckCheck, Loader2 } from "lucide-react"
import { Link, useNavigate } from "@tanstack/react-router"
import { useState } from "react"

import { Button } from "@tracky/web/components/ui/button"
import { Badge } from "@tracky/web/components/ui/badge"
import { Separator } from "@tracky/web/components/ui/separator"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@tracky/web/components/ui/popover"
import {
  useNotifications,
  useUnreadCount,
  useMarkNotificationRead,
  useMarkAllNotificationsRead,
  type Notification,
  type NotificationType,
} from "@tracky/web/hooks/use-notifications"
import { formatDistanceToNow } from "date-fns"

export function NotificationPopover() {
  const { data: notifications, isLoading } = useNotifications({ limit: 5 })
  const { data: unreadCountData } = useUnreadCount()
  const markAsRead = useMarkNotificationRead()
  const markAllAsRead = useMarkAllNotificationsRead()
  const [markingReadId, setMarkingReadId] = useState<string | null>(null)
  const [isOpen, setIsOpen] = useState(false)

  const unreadCount = unreadCountData?.count ?? 0

  const handleMarkAsRead = (notificationId: string) => {
    setMarkingReadId(notificationId)
    markAsRead.mutate(notificationId, {
      onSettled: () => setMarkingReadId(null),
    })
  }

  const handleMarkAllAsRead = () => {
    markAllAsRead.mutate()
  }

  const handleNavigate = () => {
    setIsOpen(false)
  }

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="h-5 w-5 text-muted-foreground" />
          {unreadCount > 0 && (
            <Badge
              variant="destructive"
              className="absolute -top-1 -right-1 h-5 w-5 flex items-center justify-center rounded-full p-0 text-xs"
            >
              {unreadCount > 9 ? "9+" : unreadCount}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <h4 className="font-semibold text-sm">Notifications</h4>
          {unreadCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-auto p-1 text-xs text-muted-foreground hover:text-foreground"
              onClick={handleMarkAllAsRead}
              disabled={markAllAsRead.isPending}
            >
              {markAllAsRead.isPending ? (
                <Loader2 className="h-3 w-3 animate-spin mr-1" />
              ) : (
                <CheckCheck className="h-3 w-3 mr-1" />
              )}
              Mark all read
            </Button>
          )}
        </div>

        <div className="max-h-80 overflow-y-auto">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : !notifications?.length ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <Bell className="h-8 w-8 text-muted-foreground/50 mb-2" />
              <p className="text-sm text-muted-foreground">No notifications</p>
            </div>
          ) : (
            <div className="divide-y">
              {notifications.map((notification) => (
                <NotificationItem
                  key={notification.id}
                  notification={notification}
                  onMarkAsRead={handleMarkAsRead}
                  isMarkingAsRead={markingReadId === notification.id}
                  onNavigate={handleNavigate}
                />
              ))}
            </div>
          )}
        </div>

        <Separator />
        <div className="p-2">
          <Button variant="ghost" className="w-full justify-center text-sm" asChild>
            <Link to="/notifications" onClick={() => setIsOpen(false)}>View all notifications</Link>
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}

function NotificationItem({
  notification,
  onMarkAsRead,
  isMarkingAsRead,
  onNavigate,
}: {
  notification: Notification
  onMarkAsRead: (id: string) => void
  isMarkingAsRead: boolean
  onNavigate: () => void
}) {
  const navigate = useNavigate()
  const timeAgo = formatDistanceToNow(new Date(notification.createdAt), { addSuffix: true })

  // Determine if notification is navigable and get the target URL
  const getNavigationTarget = () => {
    // For task-related notifications (assignment, due_date, task_overdue)
    if (notification.resourceType === "task" && notification.resourceId) {
      return { to: "/tasks" as const, search: { taskId: notification.resourceId } }
    }
    return null
  }

  const navigationTarget = getNavigationTarget()
  const isClickable = !!navigationTarget

  const handleClick = () => {
    if (navigationTarget) {
      // Mark as read when clicking to navigate
      if (!notification.isRead) {
        onMarkAsRead(notification.id)
      }
      onNavigate()
      navigate(navigationTarget)
    }
  }

  return (
    <div
      className={`px-4 py-3 hover:bg-muted/50 transition-colors ${
        !notification.isRead ? "bg-muted/30" : ""
      } ${isClickable ? "cursor-pointer" : ""}`}
      onClick={isClickable ? handleClick : undefined}
      role={isClickable ? "button" : undefined}
      tabIndex={isClickable ? 0 : undefined}
      onKeyDown={isClickable ? (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault()
          handleClick()
        }
      } : undefined}
    >
      <div className="flex gap-3">
        <div className="pt-0.5">
          <div
            className={`h-2 w-2 rounded-full ${
              notification.isRead ? "bg-transparent" : "bg-primary"
            }`}
          />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              <NotificationTypeBadge type={notification.type} />
              <p className="text-sm font-medium truncate mt-1">{notification.title}</p>
              {notification.body && (
                <p className="text-xs text-muted-foreground truncate mt-0.5">
                  {notification.body}
                </p>
              )}
            </div>
            {!notification.isRead && (
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 shrink-0"
                onClick={(e) => {
                  e.stopPropagation()
                  onMarkAsRead(notification.id)
                }}
                disabled={isMarkingAsRead}
              >
                <Check className="h-3 w-3" />
              </Button>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-1">{timeAgo}</p>
        </div>
      </div>
    </div>
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
      className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] uppercase font-bold tracking-wide ${styles[type]}`}
    >
      {labels[type]}
    </span>
  )
}
