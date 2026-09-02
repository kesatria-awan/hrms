import { useState } from "react"
import { createFileRoute } from "@tanstack/react-router"
import { useQuery } from "@tanstack/react-query"
import { Button } from "@tracky/web/components/ui/button"
import { Input } from "@tracky/web/components/ui/input"
import { Badge } from "@tracky/web/components/ui/badge"
import {
    Card,
    CardContent,
} from "@tracky/web/components/ui/card"
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@tracky/web/components/ui/dropdown-menu"
import {
    Search,
    MoreHorizontal,
    Download,
    FileText,
    FileImage,
    FileSpreadsheet,
    File,
    HardDrive,
    FolderOpen,
    ExternalLink,
    Loader2,
    ChevronLeft,
    ChevronRight,
} from "lucide-react"
import { getDownloadUrl } from "@tracky/web/hooks/use-attachments"
import { authManager } from "@tracky/web/lib/auth-manager"

export const Route = createFileRoute("/_authenticated/files")({
    component: FilesPage,
})

function getFileTypeFromMime(mimeType: string): "pdf" | "image" | "spreadsheet" | "other" {
    if (mimeType === "application/pdf") return "pdf"
    if (mimeType.startsWith("image/")) return "image"
    if (
        mimeType.includes("spreadsheet") ||
        mimeType.includes("excel") ||
        mimeType === "text/csv"
    )
        return "spreadsheet"
    return "other"
}

function formatFileSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
    if (bytes < 1024 * 1024 * 1024)
        return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`
}

function formatStorageSize(bytes: number): string {
    if (bytes < 1024 * 1024 * 1024)
        return `${(bytes / (1024 * 1024)).toFixed(0)} MB`
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`
}

function FilesPage() {
    const [searchQuery, setSearchQuery] = useState("")
    const [page, setPage] = useState(1)
    const limit = 20

    const { data, isLoading } = useQuery({
        queryKey: ["attachments", "workspace", searchQuery, page, limit],
        queryFn: async () => {
            const params = new URLSearchParams({
                page: String(page),
                limit: String(limit),
            })
            if (searchQuery) params.set("search", searchQuery)

            const token = authManager.getToken()
            const response = await fetch(`/api/attachments?${params}`, {
                headers: token
                    ? { Authorization: `Bearer ${token}` }
                    : {},
            })
            if (!response.ok) {
                throw new Error("Failed to fetch attachments")
            }
            return response.json() as Promise<{
                attachments: Array<{
                    id: string
                    fileName: string
                    fileSize: number
                    mimeType: string
                    createdAt: string
                    uploader: {
                        id: string
                        firstName: string | null
                        lastName: string | null
                        imageUrl: string | null
                    }
                    task: { id: string; title: string }
                    board: { id: string; name: string; color: string }
                }>
                pagination: {
                    page: number
                    limit: number
                    total: number
                    totalPages: number
                }
                storage: {
                    usedBytes: number
                    quotaBytes: number
                    totalFiles: number
                }
            }>
        },
    })

    const getFileIcon = (type: "pdf" | "image" | "spreadsheet" | "other") => {
        switch (type) {
            case "pdf":
                return <FileText className="h-8 w-8" />
            case "image":
                return <FileImage className="h-8 w-8" />
            case "spreadsheet":
                return <FileSpreadsheet className="h-8 w-8" />
            default:
                return <File className="h-8 w-8" />
        }
    }

    const getFileIconColor = (
        type: "pdf" | "image" | "spreadsheet" | "other",
    ) => {
        switch (type) {
            case "pdf":
                return "text-red-500"
            case "image":
                return "text-blue-500"
            case "spreadsheet":
                return "text-green-500"
            default:
                return "text-muted-foreground"
        }
    }

    const files = data?.attachments ?? []
    const pagination = data?.pagination
    const storage = data?.storage

    return (
        <div className="space-y-6 animate-in fade-in duration-500">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="space-y-1">
                    <h1 className="text-3xl font-bold tracking-tight">Files</h1>
                    <p className="text-muted-foreground">
                        Browse workspace attachments and documents.
                    </p>
                </div>
            </div>

            {/* Storage Summary */}
            <Card>
                <CardContent className="py-4">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                            <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                                <HardDrive className="h-5 w-5 text-primary" />
                            </div>
                            <div>
                                <p className="text-sm font-medium">
                                    Storage Used
                                </p>
                                <p className="text-2xl font-bold">
                                    {storage
                                        ? formatStorageSize(storage.usedBytes)
                                        : "—"}{" "}
                                    <span className="text-sm font-normal text-muted-foreground">
                                        /{" "}
                                        {storage
                                            ? formatStorageSize(
                                                  storage.quotaBytes,
                                              )
                                            : "—"}
                                    </span>
                                </p>
                            </div>
                        </div>
                        <div className="hidden sm:flex items-center gap-6 text-sm">
                            <div className="text-center">
                                <p className="text-2xl font-bold">
                                    {storage?.totalFiles ?? "—"}
                                </p>
                                <p className="text-muted-foreground">
                                    Total Files
                                </p>
                            </div>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Search */}
            <div className="flex items-center justify-end">
                <div className="relative w-full sm:w-64">
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                        placeholder="Search files..."
                        className="pl-9"
                        value={searchQuery}
                        onChange={(e) => {
                            setSearchQuery(e.target.value)
                            setPage(1)
                        }}
                    />
                </div>
            </div>

            {/* File List */}
            {isLoading ? (
                <div className="flex items-center justify-center p-12">
                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
            ) : (
                <div className="rounded-lg border overflow-hidden">
                    {files.length === 0 ? (
                        <div className="p-12 text-center">
                            <FolderOpen className="h-12 w-12 mx-auto text-muted-foreground/50" />
                            <p className="mt-4 text-muted-foreground">
                                No files found
                            </p>
                        </div>
                    ) : (
                        <div className="divide-y">
                            {files.map((file) => {
                                const fileType = getFileTypeFromMime(
                                    file.mimeType,
                                )
                                const uploaderName = [
                                    file.uploader.firstName,
                                    file.uploader.lastName,
                                ]
                                    .filter(Boolean)
                                    .join(" ") || "Unknown"

                                return (
                                    <div
                                        key={file.id}
                                        className="flex items-center gap-4 p-4 hover:bg-muted/30 transition-colors"
                                    >
                                        <div
                                            className={`h-12 w-12 rounded-lg bg-muted flex items-center justify-center ${getFileIconColor(fileType)}`}
                                        >
                                            {getFileIcon(fileType)}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="font-medium truncate">
                                                {file.fileName}
                                            </p>
                                            <div className="flex items-center gap-3 text-sm text-muted-foreground">
                                                <span>
                                                    {formatFileSize(
                                                        file.fileSize,
                                                    )}
                                                </span>
                                                <span>•</span>
                                                <span>
                                                    {new Date(
                                                        file.createdAt,
                                                    ).toLocaleDateString(
                                                        "en-US",
                                                        {
                                                            month: "short",
                                                            day: "numeric",
                                                            year: "numeric",
                                                        },
                                                    )}
                                                </span>
                                                <span>•</span>
                                                <span>{uploaderName}</span>
                                            </div>
                                        </div>
                                        <div className="hidden sm:flex items-center gap-2">
                                            {file.board && (
                                                <Badge
                                                    variant="outline"
                                                    style={{
                                                        borderColor:
                                                            file.board.color,
                                                    }}
                                                >
                                                    {file.board.name}
                                                </Badge>
                                            )}
                                            {file.task && (
                                                <Badge variant="outline">
                                                    <ExternalLink className="h-3 w-3 mr-1" />
                                                    {file.task.title}
                                                </Badge>
                                            )}
                                        </div>
                                        <DropdownMenu>
                                            <DropdownMenuTrigger asChild>
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    className="h-8 w-8"
                                                >
                                                    <MoreHorizontal className="h-4 w-4" />
                                                </Button>
                                            </DropdownMenuTrigger>
                                            <DropdownMenuContent align="end">
                                                <DropdownMenuItem asChild>
                                                    <a
                                                        href={getDownloadUrl(
                                                            file.id,
                                                        )}
                                                        download
                                                    >
                                                        <Download className="h-4 w-4 mr-2" />
                                                        Download
                                                    </a>
                                                </DropdownMenuItem>
                                            </DropdownMenuContent>
                                        </DropdownMenu>
                                    </div>
                                )
                            })}
                        </div>
                    )}
                </div>
            )}

            {/* Pagination */}
            {pagination && pagination.totalPages > 1 && (
                <div className="flex items-center justify-between">
                    <p className="text-sm text-muted-foreground">
                        Showing {(pagination.page - 1) * pagination.limit + 1}–
                        {Math.min(
                            pagination.page * pagination.limit,
                            pagination.total,
                        )}{" "}
                        of {pagination.total}
                    </p>
                    <div className="flex items-center gap-2">
                        <Button
                            variant="outline"
                            size="sm"
                            disabled={page <= 1}
                            onClick={() => setPage((p) => p - 1)}
                        >
                            <ChevronLeft className="h-4 w-4" />
                        </Button>
                        <span className="text-sm">
                            Page {pagination.page} of {pagination.totalPages}
                        </span>
                        <Button
                            variant="outline"
                            size="sm"
                            disabled={page >= pagination.totalPages}
                            onClick={() => setPage((p) => p + 1)}
                        >
                            <ChevronRight className="h-4 w-4" />
                        </Button>
                    </div>
                </div>
            )}
        </div>
    )
}
