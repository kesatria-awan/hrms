/**
 * Format file size for display
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return "0 B"

  const units = ["B", "KB", "MB", "GB"]
  const k = 1024
  const i = Math.floor(Math.log(bytes) / Math.log(k))

  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${units[i]}`
}

/**
 * Get file icon based on MIME type
 */
export function getFileIcon(mimeType: string): "image" | "file-text" | "file-spreadsheet" | "file-archive" | "file" {
  if (mimeType.startsWith("image/")) {
    return "image"
  }
  if (
    mimeType === "application/pdf" ||
    mimeType === "application/msword" ||
    mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    mimeType === "text/plain" ||
    mimeType === "text/markdown"
  ) {
    return "file-text"
  }
  if (
    mimeType === "application/vnd.ms-excel" ||
    mimeType === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
    mimeType === "text/csv"
  ) {
    return "file-spreadsheet"
  }
  if (mimeType === "application/zip" || mimeType === "application/gzip") {
    return "file-archive"
  }
  return "file"
}
