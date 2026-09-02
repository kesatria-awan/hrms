import { format, isValid } from "date-fns"
import { Calendar, CheckCircle } from "lucide-react"

import { Avatar, AvatarFallback, AvatarImage } from "@tracky/web/components/ui/avatar"

import type { Task } from "@tracky/web/hooks/use-tasks"

interface TaskCardProps {
  task: Task
  isDoneColumn?: boolean
  onClick?: () => void
  assignees?: Array<{
    userId: string
    user?: {
      firstName?: string | null
      lastName?: string | null
      email: string
      imageUrl?: string | null
    }
  }>
}

export function TaskCard({ task, isDoneColumn, onClick, assignees }: TaskCardProps) {
  const { title, dueDate, priority, completedAt } = task

  const isDone = isDoneColumn || !!completedAt

  const priorityColor =
    priority === "high"
      ? "bg-rose-500"
      : priority === "medium"
        ? "bg-amber-400"
        : "bg-blue-500"

  const formattedDate = (() => {
    if (!dueDate) return null
    const date = new Date(dueDate)
    return isValid(date) ? format(date, "MMM d") : null
  })()

  return (
    <div
      onClick={onClick}
      onKeyDown={(e) => {
        if (onClick && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault()
          onClick()
        }
      }}
      role="button"
      tabIndex={0}
      className="bg-white p-3.5 rounded-lg border border-border shadow-[0_1px_2px_rgba(0,0,0,0.05)] hover:shadow-md transition-all cursor-pointer group relative select-none focus:outline-none focus:ring-2 focus:ring-primary/20"
    >
      <div className="flex justify-between items-start mb-2">
        <h4
          className={`text-sm font-medium leading-normal ${isDone ? "text-muted-foreground line-through decoration-slate-300" : "text-foreground"}`}
        >
          {title}
        </h4>
        {isDone ? (
          <CheckCircle className="h-4 w-4 text-emerald-500 shrink-0 mt-0.5" />
        ) : (
          <div className={`h-2 w-2 rounded-full shrink-0 mt-1.5 ${priorityColor}`} />
        )}
      </div>

      {formattedDate && (
        <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground mt-3">
          <Calendar className="h-3 w-3" />
          <span>{formattedDate}</span>
        </div>
      )}

      {assignees && assignees.length > 0 && (
        <div className="flex -space-x-2 mt-3">
          {assignees.slice(0, 3).map((assignee) => (
            <Avatar key={assignee.userId} className="h-7 w-7 border-2 border-white ring-0">
              <AvatarImage src={assignee.user?.imageUrl || undefined} />
              <AvatarFallback className="text-[10px] bg-slate-200 text-slate-600 font-medium">
                {getInitials(assignee.user)}
              </AvatarFallback>
            </Avatar>
          ))}
          {assignees.length > 3 && (
            <div className="h-7 w-7 rounded-full bg-slate-100 border-2 border-white flex items-center justify-center text-[10px] text-slate-600 font-medium">
              +{assignees.length - 3}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function getInitials(user?: { firstName?: string | null; lastName?: string | null; email: string }) {
  if (!user) return "?"
  if (user.firstName?.length && user.lastName?.length) {
    return `${user.firstName[0]}${user.lastName[0]}`.toUpperCase()
  }
  if (user.firstName?.length) {
    return user.firstName[0].toUpperCase()
  }
  return user.email?.[0]?.toUpperCase() || "?"
}

// Priority badge component for list views
export function PriorityBadge({ priority }: { priority: "low" | "medium" | "high" }) {
  const styles = {
    high: "text-white bg-red-500",
    medium: "text-amber-800 bg-amber-100",
    low: "text-slate-600 bg-slate-100",
  }

  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${styles[priority]}`}>
      {priority.charAt(0).toUpperCase() + priority.slice(1)}
    </span>
  )
}
