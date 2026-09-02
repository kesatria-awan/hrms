import { formatDistanceToNow } from "date-fns"
import {
  Archive,
  ArchiveRestore,
  ArrowRight,
  MessageSquare,
  MessageSquareX,
  Paperclip,
  Pencil,
  Plus,
  Trash2,
  UserMinus,
  UserPlus,
} from "lucide-react"

import { Avatar, AvatarFallback, AvatarImage } from "@tracky/web/components/ui/avatar"
import type { Activity, ActivityAction } from "@tracky/web/hooks/use-activities"

interface ActivityItemProps {
  activity: Activity
}

const actionConfig: Record<ActivityAction, {
  icon: React.ElementType
  label: string
  color: string
}> = {
  task_created: {
    icon: Plus,
    label: "created this task",
    color: "text-emerald-500",
  },
  task_updated: {
    icon: Pencil,
    label: "updated this task",
    color: "text-blue-500",
  },
  task_moved: {
    icon: ArrowRight,
    label: "moved this task",
    color: "text-amber-500",
  },
  task_archived: {
    icon: Archive,
    label: "archived this task",
    color: "text-orange-500",
  },
  task_unarchived: {
    icon: ArchiveRestore,
    label: "unarchived this task",
    color: "text-teal-500",
  },
  task_deleted: {
    icon: Trash2,
    label: "deleted this task",
    color: "text-rose-500",
  },
  assignee_added: {
    icon: UserPlus,
    label: "assigned a user",
    color: "text-indigo-500",
  },
  assignee_removed: {
    icon: UserMinus,
    label: "unassigned a user",
    color: "text-violet-500",
  },
  comment_added: {
    icon: MessageSquare,
    label: "added a comment",
    color: "text-sky-500",
  },
  comment_deleted: {
    icon: MessageSquareX,
    label: "deleted a comment",
    color: "text-slate-500",
  },
  attachment_uploaded: {
    icon: Paperclip,
    label: "uploaded an attachment",
    color: "text-cyan-500",
  },
  attachment_deleted: {
    icon: Trash2,
    label: "deleted an attachment",
    color: "text-slate-500",
  },
}

function getMetadataDescription(activity: Activity): string | null {
  const metadata = activity.metadata
  if (!metadata) return null

  switch (activity.action) {
    case "task_moved": {
      const fromColumn = metadata.fromColumnName as string | undefined
      const toColumn = metadata.toColumnName as string | undefined
      if (fromColumn && toColumn) {
        return `from "${fromColumn}" to "${toColumn}"`
      }
      return null
    }
    case "task_updated": {
      const changes = metadata.changes as string[] | undefined
      if (changes && changes.length > 0) {
        return `changed ${changes.join(", ")}`
      }
      return null
    }
    case "assignee_added":
    case "assignee_removed": {
      const assigneeName = metadata.assigneeName as string | undefined
      if (assigneeName) {
        return activity.action === "assignee_added"
          ? `assigned ${assigneeName}`
          : `unassigned ${assigneeName}`
      }
      return null
    }
    case "attachment_uploaded":
    case "attachment_deleted": {
      const fileName = metadata.fileName as string | undefined
      if (fileName) {
        return activity.action === "attachment_uploaded"
          ? `uploaded "${fileName}"`
          : `deleted "${fileName}"`
      }
      return null
    }
    default:
      return null
  }
}

export function ActivityItem({ activity }: ActivityItemProps) {
  const config = actionConfig[activity.action]
  const Icon = config.icon

  const getInitials = (user: Activity["user"]) => {
    if (user.firstName && user.lastName) {
      return `${user.firstName[0]}${user.lastName[0]}`.toUpperCase()
    }
    if (user.firstName) {
      return user.firstName[0].toUpperCase()
    }
    return user.email?.[0]?.toUpperCase() || "?"
  }

  const getDisplayName = (user: Activity["user"]) => {
    if (user.firstName || user.lastName) {
      return `${user.firstName || ""} ${user.lastName || ""}`.trim()
    }
    return user.email
  }

  const metadataDescription = getMetadataDescription(activity)

  return (
    <div className="relative flex gap-3 py-3">
      {/* Timeline line connector */}
      <div className="absolute left-[15px] top-[42px] bottom-0 w-px bg-border" />

      <div className="relative shrink-0">
        <Avatar className="h-8 w-8">
          <AvatarImage src={activity.user.imageUrl || undefined} />
          <AvatarFallback className="text-xs">{getInitials(activity.user)}</AvatarFallback>
        </Avatar>
        <div className={`absolute -bottom-1 -right-1 p-0.5 rounded-full bg-background ${config.color}`}>
          <Icon className="h-3 w-3" />
        </div>
      </div>

      <div className="flex-1 min-w-0">
        <p className="text-sm">
          <span className="font-medium">{getDisplayName(activity.user)}</span>{" "}
          <span className="text-muted-foreground">
            {metadataDescription || config.label}
          </span>
        </p>
        <p className="text-xs text-muted-foreground mt-0.5">
          {formatDistanceToNow(new Date(activity.createdAt), { addSuffix: true })}
        </p>
      </div>
    </div>
  )
}
