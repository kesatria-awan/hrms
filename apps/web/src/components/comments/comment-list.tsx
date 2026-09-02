import { Loader2, MessageSquare } from "lucide-react"

import { useComments } from "@tracky/web/hooks/use-comments"
import { CommentItem } from "./comment-item"
import { CommentInput, type WorkspaceMember } from "./comment-input"

interface CommentListProps {
  taskId: string
  workspaceMembers?: WorkspaceMember[]
  canDeleteAnyComment?: boolean
}

export function CommentList({ taskId, workspaceMembers = [], canDeleteAnyComment = false }: CommentListProps) {
  const { data: comments, isLoading, error } = useComments(taskId)

  if (isLoading) {
    return (
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
        <CommentInput taskId={taskId} workspaceMembers={workspaceMembers} />
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex flex-col gap-4">
        <div className="text-center py-8 text-sm text-destructive">
          Failed to load comments. Please try again.
        </div>
        <CommentInput taskId={taskId} workspaceMembers={workspaceMembers} />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      {comments && comments.length > 0 ? (
        <div className="divide-y">
          {comments.map((comment) => (
            <CommentItem key={comment.id} comment={comment} taskId={taskId} canDeleteAnyComment={canDeleteAnyComment} />
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-8 text-center">
          <MessageSquare className="h-8 w-8 text-muted-foreground/50 mb-2" />
          <p className="text-sm text-muted-foreground">
            No comments yet
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            Be the first to add a comment
          </p>
        </div>
      )}
      <CommentInput taskId={taskId} workspaceMembers={workspaceMembers} />
    </div>
  )
}
