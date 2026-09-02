import { FileX, Loader2 } from "lucide-react"

import { useAttachments } from "@tracky/web/hooks/use-attachments"
import { AttachmentItem } from "./attachment-item"

interface AttachmentListProps {
  taskId: string
  canDeleteAnyAttachment?: boolean
}

export function AttachmentList({ taskId, canDeleteAnyAttachment = false }: AttachmentListProps) {
  const { data: attachments, isLoading, error } = useAttachments(taskId)

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="text-center py-8 text-sm text-destructive">
        Failed to load attachments
      </div>
    )
  }

  if (!attachments || attachments.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
        <FileX className="h-8 w-8 mb-2" />
        <p className="text-sm">No attachments yet</p>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {attachments.map((attachment) => (
        <AttachmentItem
          key={attachment.id}
          attachment={attachment}
          taskId={taskId}
          canDeleteAnyAttachment={canDeleteAnyAttachment}
        />
      ))}
    </div>
  )
}
