import { useCallback, useRef, useState } from "react"
import { Loader2, Upload, X } from "lucide-react"

import { Button } from "@tracky/web/components/ui/button"
import { Progress } from "@tracky/web/components/ui/progress"
import {
  useUploadAttachment,
  validateFile,
} from "@tracky/web/hooks/use-attachments"
import { formatFileSize } from "@tracky/web/lib/upload"
import { cn } from "@tracky/web/lib/utils"

interface AttachmentUploadProps {
  taskId: string
}

type UploadState = {
  id: string
  file: File
  progress: number
  status: "pending" | "uploading" | "done" | "error"
  error?: string
}

export function AttachmentUpload({ taskId }: AttachmentUploadProps) {
  const [isDragging, setIsDragging] = useState(false)
  const [uploads, setUploads] = useState<UploadState[]>([])
  const fileInputRef = useRef<HTMLInputElement>(null)

  const uploadMutation = useUploadAttachment()

  const handleFiles = useCallback(
    async (files: FileList | File[]) => {
      const fileArray = Array.from(files)

      // Validate and queue files
      const validFilesWithIds: Array<{ id: string; file: File }> = []
      for (const file of fileArray) {
        const validation = validateFile(file)
        const id = crypto.randomUUID()
        if (validation.valid) {
          validFilesWithIds.push({ id, file })
        } else {
          setUploads((prev) => [
            ...prev,
            { id, file, progress: 0, status: "error", error: validation.error },
          ])
        }
      }

      // Process valid files
      for (const { id, file } of validFilesWithIds) {
        // Add to upload queue
        setUploads((prev) => [...prev, { id, file, progress: 0, status: "uploading" }])

        try {
          await uploadMutation.mutateAsync({
            taskId,
            file,
            onProgress: (progress) => {
              setUploads((prev) =>
                prev.map((u) =>
                  u.id === id ? { ...u, progress } : u
                )
              )
            },
          })

          // Done
          setUploads((prev) =>
            prev.map((u) =>
              u.id === id ? { ...u, status: "done", progress: 100 } : u
            )
          )

          // Remove from queue after a short delay
          setTimeout(() => {
            setUploads((prev) => prev.filter((u) => u.id !== id))
          }, 1500)
        } catch (error) {
          setUploads((prev) =>
            prev.map((u) =>
              u.id === id
                ? {
                    ...u,
                    status: "error",
                    error: error instanceof Error ? error.message : "Upload failed",
                  }
                : u
            )
          )
        }
      }
    },
    [taskId, uploadMutation]
  )

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
  }, [])

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      e.stopPropagation()
      setIsDragging(false)

      if (e.dataTransfer.files?.length) {
        handleFiles(e.dataTransfer.files)
      }
    },
    [handleFiles]
  )

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files?.length) {
        handleFiles(e.target.files)
        // Reset input so same file can be selected again
        e.target.value = ""
      }
    },
    [handleFiles]
  )

  const removeUpload = useCallback((id: string) => {
    setUploads((prev) => prev.filter((u) => u.id !== id))
  }, [])

  const isUploading = uploads.some(
    (u) => u.status === "pending" || u.status === "uploading"
  )

  return (
    <div className="space-y-3">
      {/* Drop Zone */}
      <div
        className={cn(
          "border-2 border-dashed rounded-lg p-4 text-center transition-colors cursor-pointer",
          isDragging
            ? "border-primary bg-primary/5"
            : "border-muted-foreground/25 hover:border-muted-foreground/50",
          isUploading && "pointer-events-none opacity-60"
        )}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={handleFileSelect}
          accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt,.csv,.md,.zip,.gz"
        />
        <Upload className="h-6 w-6 mx-auto mb-2 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">
          Drop files here or click to upload
        </p>
        <p className="text-xs text-muted-foreground/70 mt-1">
          Max 10MB per file
        </p>
      </div>

      {/* Upload Progress */}
      {uploads.length > 0 && (
        <div className="space-y-2">
          {uploads.map((upload) => (
            <div
              key={upload.id}
              className="flex items-center gap-3 p-2 rounded-lg bg-muted/50"
            >
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{upload.file.name}</p>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span>{formatFileSize(upload.file.size)}</span>
                  {upload.status === "uploading" && (
                    <span>{upload.progress}%</span>
                  )}
                  {upload.status === "done" && (
                    <span className="text-emerald-600">Done</span>
                  )}
                  {upload.status === "error" && (
                    <span className="text-destructive">{upload.error}</span>
                  )}
                </div>
                {upload.status === "uploading" && (
                  <Progress value={upload.progress} className="h-1 mt-1" />
                )}
              </div>

              {upload.status === "uploading" ? (
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              ) : upload.status === "error" ? (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  onClick={(e) => {
                    e.stopPropagation()
                    removeUpload(upload.id)
                  }}
                >
                  <X className="h-4 w-4" />
                </Button>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
