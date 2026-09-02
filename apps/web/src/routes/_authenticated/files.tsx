import { useState } from "react"
import { createFileRoute } from "@tanstack/react-router"
import { Button } from "@tracky/web/components/ui/button"
import { Input } from "@tracky/web/components/ui/input"
import { Badge } from "@tracky/web/components/ui/badge"
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from "@tracky/web/components/ui/card"
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
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@tracky/web/components/ui/dropdown-menu"
import {
    Search,
    UploadCloud,
    MoreHorizontal,
    Download,
    Trash2,
    RotateCcw,
    FileText,
    FileImage,
    FileSpreadsheet,
    File,
    Clock,
    HardDrive,
    FolderOpen,
    ExternalLink,
} from "lucide-react"

export const Route = createFileRoute("/_authenticated/files")({
    component: FilesPage,
})

type FileItem = {
    id: number
    name: string
    size: string
    type: "pdf" | "image" | "spreadsheet" | "other"
    uploadedAt: string
    uploadedBy: string
    linkedTo?: string
    deleted?: boolean
    deletedAt?: string
    daysUntilPermanent?: number
}

// Mock data
const mockFiles: FileItem[] = [
    {
        id: 1,
        name: "Project-Specs-v2.pdf",
        size: "2.4 MB",
        type: "pdf",
        uploadedAt: "Jan 15, 2024",
        uploadedBy: "Sarah Chen",
        linkedTo: "Website Redesign",
    },
    {
        id: 2,
        name: "mockup-homepage.png",
        size: "1.8 MB",
        type: "image",
        uploadedAt: "Jan 14, 2024",
        uploadedBy: "Mike Johnson",
        linkedTo: "Homepage Task",
    },
    {
        id: 3,
        name: "budget-q1-2024.xlsx",
        size: "856 KB",
        type: "spreadsheet",
        uploadedAt: "Jan 12, 2024",
        uploadedBy: "Admin",
    },
    {
        id: 4,
        name: "meeting-notes.pdf",
        size: "124 KB",
        type: "pdf",
        uploadedAt: "Jan 10, 2024",
        uploadedBy: "Sarah Chen",
        linkedTo: "Sprint Planning",
    },
    {
        id: 5,
        name: "logo-variants.png",
        size: "3.2 MB",
        type: "image",
        uploadedAt: "Jan 8, 2024",
        uploadedBy: "Mike Johnson",
    },
    {
        id: 6,
        name: "api-documentation.pdf",
        size: "1.1 MB",
        type: "pdf",
        uploadedAt: "Jan 5, 2024",
        uploadedBy: "Admin",
        linkedTo: "API Integration",
    },
]

const mockDeletedFiles: FileItem[] = [
    {
        id: 101,
        name: "old-design-v1.pdf",
        size: "1.2 MB",
        type: "pdf",
        uploadedAt: "Dec 20, 2023",
        uploadedBy: "Sarah Chen",
        deleted: true,
        deletedAt: "Jan 10, 2024",
        daysUntilPermanent: 23,
    },
    {
        id: 102,
        name: "deprecated-specs.xlsx",
        size: "445 KB",
        type: "spreadsheet",
        uploadedAt: "Dec 15, 2023",
        uploadedBy: "Admin",
        deleted: true,
        deletedAt: "Jan 5, 2024",
        daysUntilPermanent: 18,
    },
]

function FilesPage() {
    const [activeTab, setActiveTab] = useState<"files" | "deleted">("files")
    const [searchQuery, setSearchQuery] = useState("")

    // TODO: Replace with actual auth context
    const isAdmin = true // Mock: set to false to test member view

    const getFileIcon = (type: FileItem["type"]) => {
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

    const getFileIconColor = (type: FileItem["type"]) => {
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

    const filteredFiles = mockFiles.filter((file) =>
        file.name.toLowerCase().includes(searchQuery.toLowerCase())
    )

    const filteredDeletedFiles = mockDeletedFiles.filter((file) =>
        file.name.toLowerCase().includes(searchQuery.toLowerCase())
    )

    return (
        <div className="space-y-6 animate-in fade-in duration-500">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="space-y-1">
                    <h1 className="text-3xl font-bold tracking-tight">Files</h1>
                    <p className="text-muted-foreground">
                        Manage workspace attachments and documents.
                    </p>
                </div>
                {isAdmin && (
                    <Button>
                        <UploadCloud className="mr-2 h-4 w-4" />
                        Upload File
                    </Button>
                )}
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
                                    2.4 GB{" "}
                                    <span className="text-sm font-normal text-muted-foreground">
                                        / 10 GB
                                    </span>
                                </p>
                            </div>
                        </div>
                        <div className="hidden sm:flex items-center gap-6 text-sm">
                            <div className="text-center">
                                <p className="text-2xl font-bold">
                                    {mockFiles.length}
                                </p>
                                <p className="text-muted-foreground">
                                    Total Files
                                </p>
                            </div>
                            {isAdmin && (
                                <div className="text-center">
                                    <p className="text-2xl font-bold text-amber-600">
                                        {mockDeletedFiles.length}
                                    </p>
                                    <p className="text-muted-foreground">In Trash</p>
                                </div>
                            )}
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Tabs + Search */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex gap-1 p-1 bg-muted rounded-lg w-fit">
                    <button
                        onClick={() => setActiveTab("files")}
                        className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
                            activeTab === "files"
                                ? "bg-background text-foreground shadow-sm"
                                : "text-muted-foreground hover:text-foreground"
                        }`}
                    >
                        <FolderOpen className="h-4 w-4 inline mr-2" />
                        All Files
                    </button>
                    {isAdmin && (
                        <button
                            onClick={() => setActiveTab("deleted")}
                            className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
                                activeTab === "deleted"
                                    ? "bg-background text-foreground shadow-sm"
                                    : "text-muted-foreground hover:text-foreground"
                            }`}
                        >
                            <Trash2 className="h-4 w-4 inline mr-2" />
                            Recently Deleted
                            {mockDeletedFiles.length > 0 && (
                                <Badge
                                    variant="secondary"
                                    className="ml-2 h-5 px-1.5"
                                >
                                    {mockDeletedFiles.length}
                                </Badge>
                            )}
                        </button>
                    )}
                </div>
                <div className="relative w-full sm:w-64">
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                        placeholder="Search files..."
                        className="pl-9"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                    />
                </div>
            </div>

            {/* File List */}
            {activeTab === "files" && (
                <div className="rounded-lg border overflow-hidden">
                    {filteredFiles.length === 0 ? (
                        <div className="p-12 text-center">
                            <FolderOpen className="h-12 w-12 mx-auto text-muted-foreground/50" />
                            <p className="mt-4 text-muted-foreground">
                                No files found
                            </p>
                        </div>
                    ) : (
                        <div className="divide-y">
                            {filteredFiles.map((file) => (
                                <div
                                    key={file.id}
                                    className="flex items-center gap-4 p-4 hover:bg-muted/30 transition-colors"
                                >
                                    <div
                                        className={`h-12 w-12 rounded-lg bg-muted flex items-center justify-center ${getFileIconColor(file.type)}`}
                                    >
                                        {getFileIcon(file.type)}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="font-medium truncate">
                                            {file.name}
                                        </p>
                                        <div className="flex items-center gap-3 text-sm text-muted-foreground">
                                            <span>{file.size}</span>
                                            <span>•</span>
                                            <span>{file.uploadedAt}</span>
                                            <span>•</span>
                                            <span>{file.uploadedBy}</span>
                                        </div>
                                    </div>
                                    {file.linkedTo && (
                                        <Badge
                                            variant="outline"
                                            className="hidden sm:flex"
                                        >
                                            <ExternalLink className="h-3 w-3 mr-1" />
                                            {file.linkedTo}
                                        </Badge>
                                    )}
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
                                            <DropdownMenuItem>
                                                <Download className="h-4 w-4 mr-2" />
                                                Download
                                            </DropdownMenuItem>
                                            {file.linkedTo && (
                                                <DropdownMenuItem>
                                                    <ExternalLink className="h-4 w-4 mr-2" />
                                                    Go to Task
                                                </DropdownMenuItem>
                                            )}
                                            {isAdmin && (
                                                <>
                                                    <DropdownMenuSeparator />
                                                    <DropdownMenuItem className="text-destructive focus:text-destructive">
                                                        <Trash2 className="h-4 w-4 mr-2" />
                                                        Delete
                                                    </DropdownMenuItem>
                                                </>
                                            )}
                                        </DropdownMenuContent>
                                    </DropdownMenu>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* Deleted Files - Admin Only */}
            {activeTab === "deleted" && isAdmin && (
                <Card>
                    <CardHeader className="pb-3">
                        <CardTitle className="text-base flex items-center gap-2">
                            <Clock className="h-4 w-4" />
                            30-Day Retention
                        </CardTitle>
                        <CardDescription>
                            Deleted files are kept for 30 days before permanent
                            removal. Restore them anytime within this period.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="pt-0">
                        {filteredDeletedFiles.length === 0 ? (
                            <div className="p-8 text-center border rounded-lg">
                                <Trash2 className="h-12 w-12 mx-auto text-muted-foreground/50" />
                                <p className="mt-4 text-muted-foreground">
                                    No deleted files
                                </p>
                            </div>
                        ) : (
                            <div className="rounded-lg border overflow-hidden divide-y">
                                {filteredDeletedFiles.map((file) => (
                                    <div
                                        key={file.id}
                                        className="flex items-center gap-4 p-4 hover:bg-muted/30 transition-colors"
                                    >
                                        <div
                                            className={`h-12 w-12 rounded-lg bg-muted flex items-center justify-center opacity-50 ${getFileIconColor(file.type)}`}
                                        >
                                            {getFileIcon(file.type)}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="font-medium truncate text-muted-foreground">
                                                {file.name}
                                            </p>
                                            <div className="flex items-center gap-3 text-sm text-muted-foreground">
                                                <span>{file.size}</span>
                                                <span>•</span>
                                                <span>
                                                    Deleted {file.deletedAt}
                                                </span>
                                            </div>
                                        </div>
                                        <Badge
                                            variant="outline"
                                            className="text-amber-600 border-amber-200 bg-amber-50 dark:bg-amber-950/30"
                                        >
                                            <Clock className="h-3 w-3 mr-1" />
                                            {file.daysUntilPermanent}d left
                                        </Badge>
                                        <div className="flex items-center gap-1">
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                className="text-primary"
                                            >
                                                <RotateCcw className="h-4 w-4 mr-1" />
                                                Restore
                                            </Button>
                                            <AlertDialog>
                                                <AlertDialogTrigger asChild>
                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        className="h-8 w-8 text-destructive hover:text-destructive"
                                                    >
                                                        <Trash2 className="h-4 w-4" />
                                                    </Button>
                                                </AlertDialogTrigger>
                                                <AlertDialogContent>
                                                    <AlertDialogHeader>
                                                        <AlertDialogTitle>
                                                            Delete Permanently?
                                                        </AlertDialogTitle>
                                                        <AlertDialogDescription>
                                                            This will permanently
                                                            delete "{file.name}".
                                                            This action cannot be
                                                            undone.
                                                        </AlertDialogDescription>
                                                    </AlertDialogHeader>
                                                    <AlertDialogFooter>
                                                        <AlertDialogCancel>
                                                            Cancel
                                                        </AlertDialogCancel>
                                                        <AlertDialogAction variant="destructive">
                                                            Delete Forever
                                                        </AlertDialogAction>
                                                    </AlertDialogFooter>
                                                </AlertDialogContent>
                                            </AlertDialog>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </CardContent>
                </Card>
            )}
        </div>
    )
}
