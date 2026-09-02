import { useMutation, useQueryClient } from "@tanstack/react-query"
import { useQuery } from "@tanstack/react-query"

import { useApi } from "./use-api"
import { activityKeys } from "./use-activities"

// Attachment types
export type AttachmentUploader = {
  id: string
  firstName: string | null
  lastName: string | null
  imageUrl: string | null
}

export type Attachment = {
  id: string
  workspaceId: string
  taskId: string
  fileName: string
  fileSize: number
  mimeType: string
  r2Key: string
  status: "pending" | "uploaded" | "deleted"
  uploadedById: string
  createdAt: string
  deletedAt: string | null
  uploader: AttachmentUploader
}

// Allowed MIME types (matches API)
export const ALLOWED_MIME_TYPES = [
  // Images
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/svg+xml",
  // Documents
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  // Text
  "text/plain",
  "text/csv",
  "text/markdown",
  // Archives
  "application/zip",
  "application/gzip",
] as const

export type AllowedMimeType = (typeof ALLOWED_MIME_TYPES)[number]

// Constants (match API)
export const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10MB
export const MAX_FILE_NAME_LENGTH = 255

// Query keys
export const attachmentKeys = {
  all: ["attachments"] as const,
  byTask: (taskId: string) => [...attachmentKeys.all, "task", taskId] as const,
}

// Query: Fetch attachments for a task
export function useAttachments(taskId: string) {
  const api = useApi()

  return useQuery({
    queryKey: attachmentKeys.byTask(taskId),
    queryFn: async () => {
      const response = await api.tasks[":taskId"].attachments.$get({
        param: { taskId },
      })
      if (!response.ok) {
        throw new Error("Failed to fetch attachments")
      }
      return response.json() as Promise<Attachment[]>
    },
    enabled: !!taskId,
  })
}

// Mutation: Upload file directly to API
export function useUploadAttachment() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      taskId,
      file,
      onProgress,
    }: {
      taskId: string
      file: File
      onProgress?: (percent: number) => void
    }) => {
      const formData = new FormData()
      formData.append("file", file)
      formData.append("fileName", file.name)
      formData.append("fileSize", String(file.size))
      formData.append("mimeType", file.type)

      return new Promise<Omit<Attachment, "uploader">>((resolve, reject) => {
        const xhr = new XMLHttpRequest()

        xhr.upload.addEventListener("progress", (e) => {
          if (e.lengthComputable && onProgress) {
            onProgress(Math.round((e.loaded / e.total) * 100))
          }
        })

        xhr.addEventListener("load", () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            resolve(JSON.parse(xhr.responseText))
          } else {
            try {
              const error = JSON.parse(xhr.responseText)
              reject(new Error(error.message || "Upload failed"))
            } catch {
              reject(new Error(`Upload failed with status: ${xhr.status}`))
            }
          }
        })

        xhr.addEventListener("error", () => {
          reject(new Error("Upload failed due to network error"))
        })

        xhr.addEventListener("abort", () => {
          reject(new Error("Upload was cancelled"))
        })

        xhr.open("POST", `/api/tasks/${taskId}/attachments`)
        xhr.send(formData)
      })
    },
    onSuccess: (attachment) => {
      queryClient.invalidateQueries({
        queryKey: attachmentKeys.byTask(attachment.taskId),
      })
      queryClient.invalidateQueries({
        queryKey: activityKeys.byTask(attachment.taskId),
      })
    },
  })
}

// Mutation: Delete attachment
export function useDeleteAttachment() {
  const api = useApi()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      attachmentId,
    }: {
      attachmentId: string
      taskId: string
    }) => {
      const response = await api.attachments[":id"].$delete({
        param: { id: attachmentId },
      })
      if (!response.ok) {
        const error = await response.json()
        throw new Error((error as { message?: string }).message || "Failed to delete attachment")
      }
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: attachmentKeys.byTask(variables.taskId),
      })
      // Also invalidate activity feed since deleting creates an activity
      queryClient.invalidateQueries({
        queryKey: activityKeys.byTask(variables.taskId),
      })
    },
  })
}

// Get download URL - returns the API endpoint directly (streamed via Worker)
export function getDownloadUrl(attachmentId: string): string {
  return `/api/attachments/${attachmentId}/download`
}

// Validate file before upload
export function validateFile(file: File): { valid: boolean; error?: string } {
  if (file.size > MAX_FILE_SIZE) {
    return {
      valid: false,
      error: `File size exceeds ${MAX_FILE_SIZE / 1024 / 1024}MB limit`,
    }
  }

  // Check for empty or missing MIME type
  if (!file.type) {
    return {
      valid: false,
      error: "Could not determine file type",
    }
  }

  if (!ALLOWED_MIME_TYPES.includes(file.type as AllowedMimeType)) {
    return {
      valid: false,
      error: "File type not allowed",
    }
  }

  if (file.name.length > MAX_FILE_NAME_LENGTH) {
    return {
      valid: false,
      error: `File name exceeds ${MAX_FILE_NAME_LENGTH} characters`,
    }
  }

  return { valid: true }
}
