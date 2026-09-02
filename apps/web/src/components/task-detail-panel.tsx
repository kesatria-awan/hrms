import { useState, useMemo } from "react"
import { format } from "date-fns"
import {
  X,
  Calendar,
  Loader2,
  Trash2,
  Archive,
  ArchiveRestore,
  UserPlus,
  UserMinus,
} from "lucide-react"

import { Button } from "@tracky/web/components/ui/button"
import { Input } from "@tracky/web/components/ui/input"
import { Label } from "@tracky/web/components/ui/label"
import { RichTextEditor } from "@tracky/web/components/ui/rich-text-editor"
import { Badge } from "@tracky/web/components/ui/badge"
import { Avatar, AvatarFallback, AvatarImage } from "@tracky/web/components/ui/avatar"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@tracky/web/components/ui/select"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
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
  AlertDialogTrigger,
} from "@tracky/web/components/ui/alert-dialog"
import {
  useTask,
  useUpdateTask,
  useDeleteTask,
  useArchiveTask,
  useUnarchiveTask,
  useAssignUser,
  useUnassignUser,
} from "@tracky/web/hooks/use-tasks"
import { CommentList } from "@tracky/web/components/comments/comment-list"
import { ActivityTimeline } from "@tracky/web/components/activities/activity-timeline"
import { AttachmentList, AttachmentUpload } from "@tracky/web/components/attachments"

interface TaskDetailPanelProps {
  taskId: string
  boardId: string
  columnName?: string
  onClose: () => void
  workspaceMembers?: Array<{
    userId: string
    firstName?: string | null
    lastName?: string | null
    email: string
    imageUrl?: string | null
  }>
  canDeleteAnyComment?: boolean
}

export function TaskDetailPanel({
  taskId,
  boardId,
  columnName,
  onClose,
  workspaceMembers = [],
  canDeleteAnyComment = false,
}: TaskDetailPanelProps) {
  const { data: task, isLoading } = useTask(taskId)

  const [isEditing, setIsEditing] = useState(false)
  const [editTitle, setEditTitle] = useState("")
  const [editDescription, setEditDescription] = useState("")
  const [editPriority, setEditPriority] = useState<"low" | "medium" | "high">("medium")
  const [editDueDate, setEditDueDate] = useState("")

  const updateTaskMutation = useUpdateTask()
  const deleteTaskMutation = useDeleteTask()
  const archiveTaskMutation = useArchiveTask()
  const unarchiveTaskMutation = useUnarchiveTask()
  const assignUserMutation = useAssignUser()
  const unassignUserMutation = useUnassignUser()

  const initialEditValues = useMemo(() => {
    if (!task) return null
    return {
      title: task.title,
      description: task.description || "",
      priority: task.priority,
      dueDate: task.dueDate ? format(new Date(task.dueDate), "yyyy-MM-dd") : "",
    }
  }, [task])

  const handleSave = () => {
    if (!task || !editTitle.trim()) return

    updateTaskMutation.mutate(
      {
        taskId,
        boardId,
        data: {
          title: editTitle.trim(),
          description: editDescription === "<p></p>" || !editDescription ? null : editDescription,
          priority: editPriority,
          dueDate: editDueDate ? new Date(editDueDate + "T00:00:00") : null,
        },
      },
      {
        onSuccess: () => {
          setIsEditing(false)
        },
      }
    )
  }

  const handleDelete = () => {
    deleteTaskMutation.mutate(
      { taskId, boardId },
      {
        onSuccess: () => {
          onClose()
        },
      }
    )
  }

  const handleArchive = () => {
    archiveTaskMutation.mutate({ taskId, boardId })
  }

  const handleUnarchive = () => {
    unarchiveTaskMutation.mutate({ taskId, boardId })
  }

  const handleAssignUser = (userId: string) => {
    assignUserMutation.mutate({ taskId, userId, boardId })
  }

  const handleUnassignUser = (userId: string) => {
    unassignUserMutation.mutate({ taskId, userId, boardId })
  }

  const assignedUserIds = task?.assignees?.map((a) => a.userId) || []
  const availableMembers = workspaceMembers.filter(
    (m) => !assignedUserIds.includes(m.userId)
  )

  const priorityColor =
    task?.priority === "high"
      ? "bg-rose-500"
      : task?.priority === "medium"
        ? "bg-amber-400"
        : "bg-blue-500"

  if (isLoading) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog">
        <div
          className="absolute inset-0 bg-black/40 backdrop-blur-[2px]"
          onClick={onClose}
        />
        <div className="relative w-[95vw] max-w-5xl max-h-[90vh] rounded-2xl bg-background flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </div>
    )
  }

  if (!task) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog">
        <div
          className="absolute inset-0 bg-black/40 backdrop-blur-[2px]"
          onClick={onClose}
        />
        <div className="relative w-[95vw] max-w-5xl max-h-[90vh] rounded-2xl bg-background flex flex-col items-center justify-center gap-4 py-20">
          <p className="text-muted-foreground">Task not found</p>
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    )
  }

  const isArchived = !!task.archivedAt

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-[2px] animate-in fade-in duration-300"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative w-[95vw] max-w-5xl max-h-[90vh] rounded-2xl bg-background flex flex-col shadow-2xl animate-in zoom-in-95 fade-in duration-300 overflow-hidden">
        {/* Header */}
        <div className="p-4 px-6 border-b border-border flex items-center justify-between bg-background">
          <div className="flex items-center gap-3">
            <span className="text-xs font-mono text-muted-foreground">
              {taskId.slice(0, 8).toUpperCase()}
            </span>
            {columnName && (
              <Badge variant="secondary" className="text-xs">
                {columnName}
              </Badge>
            )}
            {isArchived && (
              <Badge variant="outline" className="text-xs text-amber-600 border-amber-300">
                Archived
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-1 -mr-2">
            {isArchived ? (
              <Button
                variant="ghost"
                size="sm"
                className="h-8 text-xs text-muted-foreground hover:text-foreground gap-1.5"
                onClick={handleUnarchive}
                disabled={unarchiveTaskMutation.isPending}
              >
                <ArchiveRestore className="h-3.5 w-3.5" />
                Unarchive
              </Button>
            ) : (
              <Button
                variant="ghost"
                size="sm"
                className="h-8 text-xs text-muted-foreground hover:text-foreground gap-1.5"
                onClick={handleArchive}
                disabled={archiveTaskMutation.isPending}
              >
                <Archive className="h-3.5 w-3.5" />
                Archive
              </Button>
            )}
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 text-xs text-muted-foreground hover:text-destructive gap-1.5"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Delete
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete Task</AlertDialogTitle>
                  <AlertDialogDescription>
                    Are you sure you want to delete this task? This action cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={handleDelete}
                    className="bg-destructive hover:bg-destructive/90"
                  >
                    Delete
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground hover:text-foreground"
              onClick={onClose}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Body - Two Column Layout */}
        <div className="flex-1 grid grid-cols-5 min-h-0 overflow-hidden">
          {/* Left Column - Title, Description, Attachments, Comments */}
          <div className="col-span-3 overflow-y-auto p-6 space-y-6 border-r border-border">
            {/* Title & Created */}
            <div>
              <h2 className="text-2xl font-bold leading-tight text-foreground mb-2">
                {task.title}
              </h2>
              <div className="flex items-center gap-3 text-sm">
                <span className="text-muted-foreground">
                  Created {format(new Date(task.createdAt), "MMM d, yyyy")}
                </span>
                {task.completedAt && (
                  <>
                    <span className="text-muted-foreground">-</span>
                    <span className="text-emerald-600 font-medium">
                      Completed {format(new Date(task.completedAt), "MMM d, yyyy")}
                    </span>
                  </>
                )}
              </div>
            </div>

            {/* Edit Form or Description */}
            {isEditing ? (
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="edit-title">Title</Label>
                  <Input
                    id="edit-title"
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    autoFocus
                  />
                </div>

                <div className="space-y-2">
                  <Label>Description</Label>
                  <RichTextEditor
                    content={editDescription}
                    onChange={setEditDescription}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="edit-priority">Priority</Label>
                    <Select value={editPriority} onValueChange={(v) => setEditPriority(v as "low" | "medium" | "high")}>
                      <SelectTrigger id="edit-priority">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="low">Low</SelectItem>
                        <SelectItem value="medium">Medium</SelectItem>
                        <SelectItem value="high">High</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="edit-due-date">Due Date</Label>
                    <Input
                      id="edit-due-date"
                      type="date"
                      value={editDueDate}
                      onChange={(e) => setEditDueDate(e.target.value)}
                    />
                  </div>
                </div>

                <div className="flex gap-2">
                  <Button
                    onClick={handleSave}
                    disabled={!editTitle.trim() || updateTaskMutation.isPending}
                    className="bg-[#0f4c3a] hover:bg-[#0f4c3a]/90"
                  >
                    {updateTaskMutation.isPending ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : null}
                    Save
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => {
                      setIsEditing(false)
                    }}
                    disabled={updateTaskMutation.isPending}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    if (initialEditValues) {
                      setEditTitle(initialEditValues.title)
                      setEditDescription(initialEditValues.description)
                      setEditPriority(initialEditValues.priority)
                      setEditDueDate(initialEditValues.dueDate)
                    }
                    setIsEditing(true)
                  }}
                >
                  Edit Details
                </Button>

                {/* Description */}
                <div className="space-y-3">
                  <label className="text-base font-semibold text-foreground">Description</label>
                  <div className="min-h-[60px] text-sm leading-relaxed text-muted-foreground prose prose-sm dark:prose-invert max-w-none [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:mt-3 [&_h2]:mb-1 [&_h3]:text-base [&_h3]:font-semibold [&_h3]:mt-2 [&_h3]:mb-1 [&_ul]:list-disc [&_ul]:pl-6 [&_ol]:list-decimal [&_ol]:pl-6 [&_p]:my-1">
                    {task.description ? (
                      <div dangerouslySetInnerHTML={{ __html: task.description }} />
                    ) : (
                      <span className="italic">No description provided</span>
                    )}
                  </div>
                </div>
              </>
            )}

            {/* Attachments */}
            <div className="space-y-3">
              <h3 className="text-base font-semibold text-foreground">Attachments</h3>
              <AttachmentUpload taskId={taskId} />
              <AttachmentList taskId={taskId} canDeleteAnyAttachment={canDeleteAnyComment} />
            </div>

            {/* Comments */}
            <div className="space-y-3">
              <h3 className="text-base font-semibold text-foreground">Comments</h3>
              <CommentList taskId={taskId} workspaceMembers={workspaceMembers} canDeleteAnyComment={canDeleteAnyComment} />
            </div>
          </div>

          {/* Right Column - Metadata & Activity */}
          <div className="col-span-2 overflow-y-auto p-6 space-y-6">
            {/* Assignees */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <label className="text-base font-semibold text-foreground">Assignees</label>
                {availableMembers.length > 0 && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" size="sm" className="h-7 text-xs gap-1.5">
                        <UserPlus className="h-3 w-3" /> Assign
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-56">
                      {availableMembers.map((member) => (
                        <DropdownMenuItem
                          key={member.userId}
                          onClick={() => handleAssignUser(member.userId)}
                          disabled={assignUserMutation.isPending}
                        >
                          <Avatar className="h-6 w-6 mr-2">
                            <AvatarImage src={member.imageUrl || undefined} />
                            <AvatarFallback className="text-[10px]">
                              {getInitials(member)}
                            </AvatarFallback>
                          </Avatar>
                          <span className="truncate">
                            {member.firstName || member.lastName
                              ? `${member.firstName || ""} ${member.lastName || ""}`.trim()
                              : member.email}
                          </span>
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </div>

              {task.assignees && task.assignees.length > 0 ? (
                <div className="space-y-2">
                  {task.assignees.map((assignee) => {
                    const member = workspaceMembers.find((m) => m.userId === assignee.userId)
                    return (
                      <div
                        key={assignee.id}
                        className="flex items-center justify-between p-3 rounded-lg border bg-background"
                      >
                        <div className="flex items-center gap-3">
                          <Avatar className="h-8 w-8">
                            <AvatarImage src={member?.imageUrl || undefined} />
                            <AvatarFallback className="text-xs">
                              {member ? getInitials(member) : "?"}
                            </AvatarFallback>
                          </Avatar>
                          <div>
                            <p className="text-sm font-medium">
                              {member
                                ? (member.firstName || member.lastName
                                    ? `${member.firstName || ""} ${member.lastName || ""}`.trim()
                                    : member.email)
                                : "Unknown user"}
                            </p>
                            {member?.email && (member.firstName || member.lastName) && (
                              <p className="text-xs text-muted-foreground">{member.email}</p>
                            )}
                          </div>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-muted-foreground hover:text-destructive"
                          onClick={() => handleUnassignUser(assignee.userId)}
                          disabled={unassignUserMutation.isPending}
                        >
                          <UserMinus className="h-4 w-4" />
                        </Button>
                      </div>
                    )
                  })}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground py-4 text-center border border-dashed rounded-lg">
                  No assignees yet
                </p>
              )}
            </div>

            {/* Priority */}
            <div className="space-y-1.5">
              <span className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">
                Priority
              </span>
              <div className="flex items-center gap-2">
                <div className={`h-2 w-2 rounded-full ${priorityColor}`} />
                <span className="text-sm font-medium capitalize">{task.priority}</span>
              </div>
            </div>

            {/* Due Date */}
            <div className="space-y-1.5">
              <span className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">
                Due Date
              </span>
              <div className="flex items-center gap-2 text-sm font-medium">
                <Calendar className="h-4 w-4 text-muted-foreground" />
                <span>
                  {task.dueDate
                    ? format(new Date(task.dueDate), "MMM d, yyyy")
                    : "Not set"}
                </span>
              </div>
            </div>

            {/* Column */}
            {columnName && (
              <div className="space-y-1.5">
                <span className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">
                  Column
                </span>
                <div>
                  <Badge variant="secondary" className="text-xs">
                    {columnName}
                  </Badge>
                </div>
              </div>
            )}

            {/* Activity */}
            <div className="space-y-3 pt-4 border-t border-border">
              <h3 className="text-base font-semibold text-foreground">Activity</h3>
              <ActivityTimeline taskId={taskId} />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function getInitials(user: { firstName?: string | null; lastName?: string | null; email: string }) {
  if (user.firstName && user.lastName) {
    return `${user.firstName[0]}${user.lastName[0]}`.toUpperCase()
  }
  if (user.firstName) {
    return user.firstName[0].toUpperCase()
  }
  return user.email?.[0]?.toUpperCase() || "?"
}
