import { useState } from "react"
import { Loader2, UserCircle } from "lucide-react"

import { Button } from "@tracky/web/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@tracky/web/components/ui/dialog"
import { Input } from "@tracky/web/components/ui/input"
import { Label } from "@tracky/web/components/ui/label"
import { RichTextEditor } from "@tracky/web/components/ui/rich-text-editor"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@tracky/web/components/ui/select"
import { Avatar, AvatarFallback, AvatarImage } from "@tracky/web/components/ui/avatar"
import { useCreateTask, useAssignUser } from "@tracky/web/hooks/use-tasks"

type WorkspaceMember = {
  userId: string
  email: string
  firstName: string | null
  lastName: string | null
  imageUrl: string | null
  role: string
}

interface CreateTaskDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  boardId: string
  columnId: string
  columnName?: string
  workspaceMembers?: WorkspaceMember[]
}

export function CreateTaskDialog({
  open,
  onOpenChange,
  boardId,
  columnId,
  columnName,
  workspaceMembers = [],
}: CreateTaskDialogProps) {
  const [title, setTitle] = useState("")
  const [description, setDescription] = useState("")
  const [priority, setPriority] = useState<"low" | "medium" | "high">("medium")
  const [dueDate, setDueDate] = useState("")
  const [assigneeId, setAssigneeId] = useState<string>("")

  const createTaskMutation = useCreateTask()
  const assignUserMutation = useAssignUser()

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()

    if (!title.trim()) return

    createTaskMutation.mutate(
      {
        boardId,
        columnId,
        title: title.trim(),
        description: description && description !== "<p></p>" ? description : undefined,
        priority,
        dueDate: dueDate ? new Date(dueDate + "T00:00:00") : undefined,
      },
      {
        onSuccess: (newTask) => {
          // Assign user if selected (and not "unassigned")
          if (assigneeId && assigneeId !== "unassigned" && newTask?.id) {
            assignUserMutation.mutate(
              {
                taskId: newTask.id,
                userId: assigneeId,
                boardId,
              },
              {
                onError: (error) => {
                  // Task created but assignment failed
                  console.error("Task created but failed to assign user:", error)
                },
              }
            )
          }
          // Reset form
          setTitle("")
          setDescription("")
          setPriority("medium")
          setDueDate("")
          setAssigneeId("")
          onOpenChange(false)
        },
      }
    )
  }

  const handleOpenChange = (isOpen: boolean) => {
    if (!isOpen) {
      // Reset form when closing
      setTitle("")
      setDescription("")
      setPriority("medium")
      setDueDate("")
      setAssigneeId("")
    }
    onOpenChange(isOpen)
  }

  const getMemberName = (member: WorkspaceMember) => {
    if (member.firstName || member.lastName) {
      return `${member.firstName || ""} ${member.lastName || ""}`.trim()
    }
    return member.email
  }

  const getMemberInitials = (member: WorkspaceMember) => {
    if (member.firstName && member.lastName) {
      return `${member.firstName[0]}${member.lastName[0]}`.toUpperCase()
    }
    return member.email[0].toUpperCase()
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Create Task</DialogTitle>
          <DialogDescription>
            {columnName
              ? `Add a new task to "${columnName}"`
              : "Add a new task to this column"}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="task-title">Title</Label>
            <Input
              id="task-title"
              placeholder="Enter task title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              autoFocus
            />
          </div>

          <div className="space-y-2">
            <Label>Description (optional)</Label>
            <RichTextEditor
              content={description}
              onChange={setDescription}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="task-priority">Priority</Label>
              <Select value={priority} onValueChange={(v) => setPriority(v as "low" | "medium" | "high")}>
                <SelectTrigger id="task-priority">
                  <SelectValue placeholder="Select priority" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">
                    <div className="flex items-center gap-2">
                      <div className="h-2 w-2 rounded-full bg-blue-500" />
                      Low
                    </div>
                  </SelectItem>
                  <SelectItem value="medium">
                    <div className="flex items-center gap-2">
                      <div className="h-2 w-2 rounded-full bg-amber-400" />
                      Medium
                    </div>
                  </SelectItem>
                  <SelectItem value="high">
                    <div className="flex items-center gap-2">
                      <div className="h-2 w-2 rounded-full bg-rose-500" />
                      High
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="task-due-date">Due Date (optional)</Label>
              <Input
                id="task-due-date"
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
              />
            </div>
          </div>

          {workspaceMembers.length > 0 && (
            <div className="space-y-2">
              <Label htmlFor="task-assignee">Assignee (optional)</Label>
              <Select value={assigneeId} onValueChange={setAssigneeId}>
                <SelectTrigger id="task-assignee">
                  <SelectValue placeholder="Select assignee">
                    {assigneeId && (
                      <div className="flex items-center gap-2">
                        {(() => {
                          const member = workspaceMembers.find((m) => m.userId === assigneeId)
                          if (!member) return null
                          return (
                            <>
                              <Avatar className="h-5 w-5">
                                <AvatarImage src={member.imageUrl || undefined} />
                                <AvatarFallback className="bg-slate-200 text-slate-600 text-[10px] font-medium">
                                  {getMemberInitials(member)}
                                </AvatarFallback>
                              </Avatar>
                              <span>{getMemberName(member)}</span>
                            </>
                          )
                        })()}
                      </div>
                    )}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="unassigned">
                    <div className="flex items-center gap-2">
                      <UserCircle className="h-5 w-5 text-muted-foreground" />
                      <span className="text-muted-foreground">Unassigned</span>
                    </div>
                  </SelectItem>
                  {workspaceMembers.map((member) => (
                    <SelectItem key={member.userId} value={member.userId}>
                      <div className="flex items-center gap-2">
                        <Avatar className="h-5 w-5">
                          <AvatarImage src={member.imageUrl || undefined} />
                          <AvatarFallback className="bg-slate-200 text-slate-600 text-[10px] font-medium">
                            {getMemberInitials(member)}
                          </AvatarFallback>
                        </Avatar>
                        <span>{getMemberName(member)}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => handleOpenChange(false)}
              disabled={createTaskMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={!title.trim() || createTaskMutation.isPending}
              className="bg-[#0f4c3a] hover:bg-[#0f4c3a]/90"
            >
              {createTaskMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Creating...
                </>
              ) : (
                "Create Task"
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
