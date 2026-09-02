import { useState } from "react"
import { useAuth } from "@tracky/web/contexts/auth-context"
import { formatDistanceToNow } from "date-fns"
import {
  Download,
  File,
  FileArchive,
  FileSpreadsheet,
  FileText,
  Image,
  Loader2,
  MoreHorizontal,
  Trash2,
} from "lucide-react"

import { Avatar, AvatarFallback, AvatarImage } from "@tracky/web/components/ui/avatar"
import { Button } from "@tracky/web/components/ui/button"
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
} from "@tracky/web/components/ui/alert-dialog"
import {
  Dialog,
  DialogContent,
} from "@tracky/web/components/ui/dialog"
import {
  useDeleteAttachment,
  getDownloadUrl,
  type Attachment,
} from "@tracky/web/hooks/use-attachments"
import { formatFileSize, getFileIcon } from "@tracky/web/lib/upload"

interface AttachmentItemProps {
  attachment: Attachment
  taskId: string
  canDeleteAnyAttachment?: boolean
}

export function AttachmentItem({ attachment, taskId, canDeleteAnyAttachment = false }: AttachmentItemProps) {
  const { user: currentUser } = useAuth()
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [showPreview, setShowPreview] = useState(false)
  const deleteAttachmentMutation = useDeleteAttachment()

  const isUploader = currentUser?.id === attachment.uploadedById
  const canDelete = isUploader || canDeleteAnyAttachment

  const handleDownload = () => {
    const link = document.createElement("a")
    link.href = getDownloadUrl(attachment.id)
    link.download = attachment.fileName
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  const handleDelete = () => {
    deleteAttachmentMutation.mutate(
      { attachmentId: attachment.id, taskId },
      {
        onSuccess: () => {
          setShowDeleteDialog(false)
        },
      }
    )
  }

  const getInitials = (uploader: Attachment["uploader"]) => {
    if (uploader.firstName && uploader.lastName) {
      return `${uploader.firstName[0]}${uploader.lastName[0]}`.toUpperCase()
    }
    if (uploader.firstName) {
      return uploader.firstName[0].toUpperCase()
    }
    return "?"
  }

  const getDisplayName = (uploader: Attachment["uploader"]) => {
    if (uploader.firstName || uploader.lastName) {
      return `${uploader.firstName || ""} ${uploader.lastName || ""}`.trim()
    }
    return "Unknown"
  }

  const isImage = attachment.mimeType.startsWith("image/")
  const iconType = getFileIcon(attachment.mimeType)
  const IconComponent = {
    image: Image,
    "file-text": FileText,
    "file-spreadsheet": FileSpreadsheet,
    "file-archive": FileArchive,
    file: File,
  }[iconType]

  const thumbnailUrl = getDownloadUrl(attachment.id)

  if (isImage) {
    return (
      <div className="group flex items-center gap-3 p-2 rounded-lg border bg-background hover:bg-muted/50 transition-colors">
        {/* Thumbnail */}
        <div
          className="shrink-0 w-[100px] h-[100px] rounded-md bg-muted overflow-hidden cursor-pointer"
          onClick={() => setShowPreview(true)}
        >
          <img
            src={thumbnailUrl}
            alt={attachment.fileName}
            className="w-full h-full object-cover"
            loading="lazy"
          />
        </div>

        {/* File Info */}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate" title={attachment.fileName}>
            {attachment.fileName}
          </p>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>{formatFileSize(attachment.fileSize)}</span>
            <span>-</span>
            <span className="truncate">{getDisplayName(attachment.uploader)}</span>
            <span>-</span>
            <span>
              {formatDistanceToNow(new Date(attachment.createdAt), { addSuffix: true })}
            </span>
          </div>
        </div>

        {/* Actions */}
        <div className="shrink-0 flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={handleDownload}
          >
            <Download className="h-4 w-4" />
          </Button>

          {canDelete && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  onClick={() => setShowDeleteDialog(true)}
                  className="text-destructive focus:text-destructive"
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>

        <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Attachment</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to delete "{attachment.fileName}"? This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={deleteAttachmentMutation.isPending}>
                Cancel
              </AlertDialogCancel>
              <AlertDialogAction
                onClick={handleDelete}
                disabled={deleteAttachmentMutation.isPending}
                className="bg-destructive hover:bg-destructive/90"
              >
                {deleteAttachmentMutation.isPending && (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                )}
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Image Preview Dialog */}
        <Dialog open={showPreview} onOpenChange={setShowPreview}>
          <DialogContent className="max-w-3xl p-2 bg-background/95 backdrop-blur">
            <div className="flex flex-col items-center gap-3">
              <img
                src={thumbnailUrl}
                alt={attachment.fileName}
                className="max-h-[70vh] w-auto rounded-md object-contain"
              />
              <div className="flex items-center gap-3 text-sm text-muted-foreground">
                <span className="font-medium text-foreground">{attachment.fileName}</span>
                <span>{formatFileSize(attachment.fileSize)}</span>
                <Button variant="outline" size="sm" onClick={handleDownload}>
                  <Download className="mr-1.5 h-3.5 w-3.5" />
                  Download
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    )
  }

  return (
    <div className="group flex items-center gap-3 p-3 rounded-lg border bg-background hover:bg-muted/50 transition-colors">
      {/* File Icon */}
      <div className="shrink-0 w-10 h-10 rounded-lg bg-muted flex items-center justify-center">
        <IconComponent className="h-5 w-5 text-muted-foreground" />
      </div>

      {/* File Info */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate" title={attachment.fileName}>
          {attachment.fileName}
        </p>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>{formatFileSize(attachment.fileSize)}</span>
          <span>-</span>
          <Avatar className="h-4 w-4">
            <AvatarImage src={attachment.uploader.imageUrl || undefined} />
            <AvatarFallback className="text-[8px]">
              {getInitials(attachment.uploader)}
            </AvatarFallback>
          </Avatar>
          <span className="truncate">{getDisplayName(attachment.uploader)}</span>
          <span>-</span>
          <span>
            {formatDistanceToNow(new Date(attachment.createdAt), { addSuffix: true })}
          </span>
        </div>
      </div>

      {/* Actions */}
      <div className="shrink-0 flex items-center gap-1">
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={handleDownload}
        >
          <Download className="h-4 w-4" />
        </Button>

        {canDelete && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                onClick={() => setShowDeleteDialog(true)}
                className="text-destructive focus:text-destructive"
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Attachment</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{attachment.fileName}"? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteAttachmentMutation.isPending}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleteAttachmentMutation.isPending}
              className="bg-destructive hover:bg-destructive/90"
            >
              {deleteAttachmentMutation.isPending && (
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
