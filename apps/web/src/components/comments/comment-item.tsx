import { useState } from "react"
import { useAuth } from "@tracky/web/contexts/auth-context"
import { formatDistanceToNow } from "date-fns"
import { Loader2, MoreHorizontal, Pencil, Trash2 } from "lucide-react"

import { Avatar, AvatarFallback, AvatarImage } from "@tracky/web/components/ui/avatar"
import { Button } from "@tracky/web/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@tracky/web/components/ui/dropdown-menu"
import { Textarea } from "@tracky/web/components/ui/textarea"
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
import { useUpdateComment, useDeleteComment, type Comment } from "@tracky/web/hooks/use-comments"

interface CommentItemProps {
  comment: Comment
  taskId: string
  canDeleteAnyComment?: boolean
}

export function CommentItem({ comment, taskId, canDeleteAnyComment = false }: CommentItemProps) {
  const { user: currentUser } = useAuth()
  const [isEditing, setIsEditing] = useState(false)
  const [editContent, setEditContent] = useState(comment.content)
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)

  const updateCommentMutation = useUpdateComment()
  const deleteCommentMutation = useDeleteComment()

  const isAuthor = currentUser?.id === comment.userId
  const canEdit = isAuthor
  const canDelete = isAuthor || canDeleteAnyComment

  const handleSaveEdit = () => {
    if (!editContent.trim()) return

    updateCommentMutation.mutate(
      { commentId: comment.id, taskId, content: editContent.trim() },
      {
        onSuccess: () => {
          setIsEditing(false)
        },
      }
    )
  }

  const handleCancelEdit = () => {
    setEditContent(comment.content)
    setIsEditing(false)
  }

  const handleDelete = () => {
    deleteCommentMutation.mutate(
      { commentId: comment.id, taskId },
      {
        onSuccess: () => {
          setShowDeleteDialog(false)
        },
      }
    )
  }

  const getInitials = (user: Comment["user"]) => {
    if (user.firstName && user.lastName) {
      return `${user.firstName[0]}${user.lastName[0]}`.toUpperCase()
    }
    if (user.firstName) {
      return user.firstName[0].toUpperCase()
    }
    return user.email?.[0]?.toUpperCase() || "?"
  }

  const getDisplayName = (user: Comment["user"]) => {
    if (user.firstName || user.lastName) {
      return `${user.firstName || ""} ${user.lastName || ""}`.trim()
    }
    return user.email
  }

  const isModified = comment.createdAt !== comment.updatedAt

  // Build a map of userId -> mention user info for quick lookup
  const mentionMap = new Map(
    comment.mentions.map((m) => [m.userId, m.user])
  )

  // Render content with styled mentions
  const renderContentWithMentions = (content: string) => {
    const mentionRegex = /@(\w+)/g
    const parts: React.ReactNode[] = []
    let lastIndex = 0
    let match

    while ((match = mentionRegex.exec(content)) !== null) {
      // Add text before the mention
      if (match.index > lastIndex) {
        parts.push(content.slice(lastIndex, match.index))
      }

      const userId = match[1]
      const mentionUser = mentionMap.get(userId)

      if (mentionUser) {
        // Render styled mention
        const displayName = mentionUser.firstName || mentionUser.lastName
          ? `${mentionUser.firstName || ""} ${mentionUser.lastName || ""}`.trim()
          : mentionUser.email
        parts.push(
          <span
            key={`mention-${match.index}`}
            className="inline-flex items-center px-1 py-0.5 mx-0.5 bg-primary/10 text-primary rounded text-sm font-medium"
          >
            @{displayName}
          </span>
        )
      } else {
        // Keep original mention text if user not found in mentions
        parts.push(match[0])
      }

      lastIndex = match.index + match[0].length
    }

    // Add remaining text
    if (lastIndex < content.length) {
      parts.push(content.slice(lastIndex))
    }

    return parts
  }

  return (
    <div className="group flex gap-3 py-3">
      <Avatar className="h-8 w-8 shrink-0">
        <AvatarImage src={comment.user.imageUrl || undefined} />
        <AvatarFallback className="text-xs">{getInitials(comment.user)}</AvatarFallback>
      </Avatar>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">{getDisplayName(comment.user)}</span>
          <span className="text-xs text-muted-foreground">
            {formatDistanceToNow(new Date(comment.createdAt), { addSuffix: true })}
          </span>
          {isModified && (
            <span className="text-xs text-muted-foreground">(edited)</span>
          )}
          {(canEdit || canDelete) && !isEditing && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <MoreHorizontal className="h-3 w-3" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {canEdit && (
                  <DropdownMenuItem onClick={() => setIsEditing(true)}>
                    <Pencil className="h-4 w-4 mr-2" />
                    Edit
                  </DropdownMenuItem>
                )}
                {canDelete && (
                  <DropdownMenuItem
                    onClick={() => setShowDeleteDialog(true)}
                    className="text-destructive focus:text-destructive"
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    Delete
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>

        {isEditing ? (
          <div className="mt-2 space-y-2">
            <Textarea
              value={editContent}
              onChange={(e) => setEditContent(e.target.value)}
              rows={3}
              className="resize-none"
              autoFocus
            />
            <div className="flex gap-2">
              <Button
                size="sm"
                onClick={handleSaveEdit}
                disabled={!editContent.trim() || updateCommentMutation.isPending}
              >
                {updateCommentMutation.isPending && (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                )}
                Save
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={handleCancelEdit}
                disabled={updateCommentMutation.isPending}
              >
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <p className="mt-1 text-sm text-foreground whitespace-pre-wrap break-words">
            {renderContentWithMentions(comment.content)}
          </p>
        )}
      </div>

      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Comment</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this comment? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteCommentMutation.isPending}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleteCommentMutation.isPending}
              className="bg-destructive hover:bg-destructive/90"
            >
              {deleteCommentMutation.isPending && (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              )}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
