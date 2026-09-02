import { useState } from "react"
import { createFileRoute } from "@tanstack/react-router"
import { Button } from "@tracky/web/components/ui/button"
import { Input } from "@tracky/web/components/ui/input"
import { Label } from "@tracky/web/components/ui/label"
import { Separator } from "@tracky/web/components/ui/separator"
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
    AlertDialogMedia,
    AlertDialogTitle,
    AlertDialogTrigger,
} from "@tracky/web/components/ui/alert-dialog"
import {
    Building2,
    CreditCard,
    HardDrive,
    Users,
    Trash2,
    AlertTriangle,
    Shield,
    Clock,
    ExternalLink,
    CheckCircle2,
    XCircle,
    AlertCircle,
} from "lucide-react"

export const Route = createFileRoute("/_authenticated/settings")({
    component: SettingsPage,
})

// Mock data for audit logs
const auditLogs = [
    {
        id: 1,
        event: "Cross-tenant access blocked",
        user: "john@external.com",
        details: "Attempted to access workspace from unauthorized tenant",
        timestamp: "2024-01-15 14:32:00",
        status: "blocked",
    },
    {
        id: 2,
        event: "Admin role granted",
        user: "sarah@acme.com",
        details: "User promoted to Workspace Admin",
        timestamp: "2024-01-14 09:15:00",
        status: "success",
    },
    {
        id: 3,
        event: "Login from new device",
        user: "mike@acme.com",
        details: "New device: MacBook Pro, San Francisco, CA",
        timestamp: "2024-01-13 18:45:00",
        status: "warning",
    },
    {
        id: 4,
        event: "Cross-tenant access blocked",
        user: "attacker@malicious.com",
        details: "Multiple failed attempts from IP 192.168.1.100",
        timestamp: "2024-01-12 03:22:00",
        status: "blocked",
    },
    {
        id: 5,
        event: "API key regenerated",
        user: "admin@acme.com",
        details: "Workspace API key was regenerated",
        timestamp: "2024-01-11 11:00:00",
        status: "success",
    },
]

function SettingsPage() {
    const [deleteConfirmation, setDeleteConfirmation] = useState("")
    const [retentionStep, setRetentionStep] = useState<
        "initial" | "confirm" | "scheduled"
    >("initial")

    const isDeleteConfirmed = deleteConfirmation === "DELETE"

    const handleDeleteCancel = () => {
        setDeleteConfirmation("")
        setRetentionStep("initial")
    }

    const handleScheduleDeletion = () => {
        setRetentionStep("scheduled")
    }

    const getStatusIcon = (status: string) => {
        switch (status) {
            case "blocked":
                return <XCircle className="h-4 w-4 text-destructive" />
            case "success":
                return <CheckCircle2 className="h-4 w-4 text-green-600" />
            case "warning":
                return <AlertCircle className="h-4 w-4 text-amber-500" />
            default:
                return null
        }
    }

    const getStatusBadge = (status: string) => {
        switch (status) {
            case "blocked":
                return <Badge variant="destructive">Blocked</Badge>
            case "success":
                return (
                    <Badge className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
                        Success
                    </Badge>
                )
            case "warning":
                return (
                    <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                        Warning
                    </Badge>
                )
            default:
                return null
        }
    }

    return (
        <div className="space-y-8 animate-in fade-in duration-500">
            <div className="space-y-1">
                <div className="flex items-center gap-2">
                    <h1 className="text-3xl font-bold tracking-tight">
                        Workspace Settings
                    </h1>
                    <Badge variant="secondary">Admin Only</Badge>
                </div>
                <p className="text-muted-foreground">
                    Manage your workspace preferences, billing, and security
                    settings.
                </p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Workspace Name */}
                <Card>
                    <CardHeader>
                        <div className="flex items-center gap-2">
                            <Building2 className="h-5 w-5 text-muted-foreground" />
                            <CardTitle>Workspace Name</CardTitle>
                        </div>
                        <CardDescription>
                            Your workspace identity across the platform.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="grid w-full items-center gap-1.5">
                            <Label htmlFor="name">Display Name</Label>
                            <Input id="name" defaultValue="Acme Corp" />
                        </div>
                        <div className="grid w-full items-center gap-1.5">
                            <Label htmlFor="slug">URL Slug</Label>
                            <div className="flex items-center gap-2">
                                <span className="text-muted-foreground text-sm">
                                    tracky.app/
                                </span>
                                <Input
                                    id="slug"
                                    defaultValue="acme-corp"
                                    className="max-w-[200px]"
                                />
                            </div>
                            <p className="text-xs text-muted-foreground">
                                This is your workspace's unique URL identifier.
                            </p>
                        </div>
                        <Button className="w-fit">Save Changes</Button>
                    </CardContent>
                </Card>

                {/* Storage Usage */}
                <Card>
                    <CardHeader>
                        <div className="flex items-center gap-2">
                            <HardDrive className="h-5 w-5 text-muted-foreground" />
                            <CardTitle>Storage Usage</CardTitle>
                            <Badge variant="outline">10 GB Plan</Badge>
                        </div>
                        <CardDescription>
                            Monitor your workspace storage and resource usage.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-6">
                        <div className="space-y-3">
                            <div className="flex justify-between text-sm">
                                <span className="font-medium flex items-center gap-2">
                                    <HardDrive className="h-4 w-4 text-muted-foreground" />
                                    Storage Used
                                </span>
                                <span className="text-muted-foreground">
                                    2.4 GB / 10 GB
                                </span>
                            </div>
                            <div className="h-3 w-full bg-secondary rounded-full overflow-hidden">
                                <div className="h-full bg-primary w-[24%] transition-all" />
                            </div>
                            <p className="text-xs text-muted-foreground">
                                7.6 GB remaining • Includes files, attachments,
                                and backups
                            </p>
                        </div>
                        <Separator />
                        <div className="space-y-3">
                            <div className="flex justify-between text-sm">
                                <span className="font-medium flex items-center gap-2">
                                    <Users className="h-4 w-4 text-muted-foreground" />
                                    User Seats
                                </span>
                                <span className="text-muted-foreground">
                                    4 / 10 Active
                                </span>
                            </div>
                            <div className="h-3 w-full bg-secondary rounded-full overflow-hidden">
                                <div className="h-full bg-primary w-[40%] transition-all" />
                            </div>
                            <p className="text-xs text-muted-foreground">
                                6 seats available • Invite more team members
                            </p>
                        </div>
                        <div className="flex gap-2">
                            <Button variant="outline" size="sm">
                                Manage Storage
                            </Button>
                            <Button variant="outline" size="sm">
                                View Breakdown
                            </Button>
                        </div>
                    </CardContent>
                </Card>

                {/* Billing Info / Subscription - Full width */}
                <Card className="lg:col-span-2">
                    <CardHeader>
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <CreditCard className="h-5 w-5 text-muted-foreground" />
                                <CardTitle>Billing & Subscription</CardTitle>
                            </div>
                            <Badge className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
                                Active
                            </Badge>
                        </div>
                        <CardDescription>
                            Manage your subscription plan and payment methods.
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                            {/* Current Plan */}
                            <div className="rounded-lg border bg-muted/30 p-4 space-y-3">
                                <div className="flex items-center justify-between">
                                    <h4 className="font-semibold">
                                        Business Plan
                                    </h4>
                                    <p className="text-2xl font-bold">
                                        $49
                                        <span className="text-sm font-normal text-muted-foreground">
                                            /mo
                                        </span>
                                    </p>
                                </div>
                                <p className="text-sm text-muted-foreground">
                                    10 GB storage • 10 user seats • Priority
                                    support
                                </p>
                                <Button variant="outline" size="sm" className="w-full">
                                    <ExternalLink className="h-4 w-4 mr-1" />
                                    Upgrade Plan
                                </Button>
                            </div>

                            {/* Payment Method */}
                            <div className="rounded-lg border bg-muted/30 p-4 space-y-3">
                                <div>
                                    <p className="text-sm text-muted-foreground">
                                        Payment method
                                    </p>
                                    <p className="font-medium flex items-center gap-1 mt-1">
                                        <CreditCard className="h-4 w-4" />
                                        Visa •••• 4242
                                    </p>
                                </div>
                                <div>
                                    <p className="text-sm text-muted-foreground">
                                        Next billing date
                                    </p>
                                    <p className="font-medium mt-1">
                                        February 15, 2024
                                    </p>
                                </div>
                                <Button variant="outline" size="sm" className="w-full">
                                    Update Payment
                                </Button>
                            </div>

                            {/* Quick Actions */}
                            <div className="rounded-lg border bg-muted/30 p-4 space-y-3">
                                <p className="text-sm font-medium">
                                    Quick Actions
                                </p>
                                <div className="space-y-2">
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        className="w-full justify-start"
                                    >
                                        View Invoices
                                    </Button>
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        className="w-full justify-start"
                                    >
                                        Download Receipts
                                    </Button>
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        className="w-full justify-start text-muted-foreground"
                                    >
                                        Cancel Subscription
                                    </Button>
                                </div>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                {/* Audit Logs - Full width */}
                <Card className="lg:col-span-2">
                    <CardHeader>
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <Shield className="h-5 w-5 text-muted-foreground" />
                                <CardTitle>Audit Logs</CardTitle>
                            </div>
                            <Button variant="outline" size="sm">
                                Export Logs
                            </Button>
                        </div>
                        <CardDescription>
                            Security events and cross-tenant access attempts for
                            your workspace.
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="rounded-lg border overflow-hidden">
                            {/* Table Header - Hidden on mobile */}
                            <div className="hidden md:grid md:grid-cols-[1fr_1.5fr_1fr_1fr_auto] gap-4 p-3 bg-muted/50 text-sm font-medium text-muted-foreground border-b">
                                <span>Event</span>
                                <span>Details</span>
                                <span>User</span>
                                <span>Timestamp</span>
                                <span>Status</span>
                            </div>
                            <div className="divide-y">
                                {auditLogs.map((log) => (
                                    <div
                                        key={log.id}
                                        className="grid grid-cols-1 md:grid-cols-[1fr_1.5fr_1fr_1fr_auto] gap-2 md:gap-4 p-4 hover:bg-muted/30 transition-colors items-center"
                                    >
                                        {/* Mobile: Icon + Event */}
                                        <div className="flex items-center gap-2">
                                            <span className="md:hidden">
                                                {getStatusIcon(log.status)}
                                            </span>
                                            <p className="font-medium text-sm">
                                                {log.event}
                                            </p>
                                        </div>
                                        {/* Details */}
                                        <p className="text-sm text-muted-foreground">
                                            {log.details}
                                        </p>
                                        {/* User */}
                                        <p className="text-sm text-muted-foreground flex items-center gap-1">
                                            <Users className="h-3 w-3 md:hidden" />
                                            {log.user}
                                        </p>
                                        {/* Timestamp */}
                                        <p className="text-sm text-muted-foreground flex items-center gap-1">
                                            <Clock className="h-3 w-3 md:hidden" />
                                            {log.timestamp}
                                        </p>
                                        {/* Status Badge */}
                                        <div className="flex items-center gap-2">
                                            <span className="hidden md:block">
                                                {getStatusIcon(log.status)}
                                            </span>
                                            {getStatusBadge(log.status)}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                        <div className="mt-4 flex justify-center">
                            <Button variant="ghost" size="sm">
                                View All Logs
                            </Button>
                        </div>
                    </CardContent>
                </Card>

                {/* Danger Zone - Delete Workspace - Full width */}
                <div className="lg:col-span-2 border border-destructive/20 rounded-lg p-6 bg-destructive/5 space-y-4">
                    <div>
                        <h3 className="text-lg font-semibold text-destructive flex items-center gap-2">
                            <AlertTriangle className="h-5 w-5" />
                            Danger Zone
                        </h3>
                        <p className="text-sm text-destructive/80">
                            Irreversible actions for your workspace.
                        </p>
                    </div>
                    <Separator className="bg-destructive/10" />
                    <div className="flex items-center justify-between">
                        <div className="space-y-1">
                            <p className="font-medium flex items-center gap-2">
                                <Trash2 className="h-4 w-4" />
                                Delete Workspace
                            </p>
                            <p className="text-sm text-muted-foreground">
                                Permanently delete your workspace, all projects,
                                tasks, and data.
                            </p>
                        </div>

                        <AlertDialog
                            onOpenChange={(open) => {
                                if (!open) handleDeleteCancel()
                            }}
                        >
                            <AlertDialogTrigger asChild>
                                <Button variant="destructive">
                                    Delete Workspace
                                </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                                {retentionStep === "initial" && (
                                    <>
                                        <AlertDialogHeader>
                                            <AlertDialogMedia className="bg-destructive/10">
                                                <AlertTriangle className="h-8 w-8 text-destructive" />
                                            </AlertDialogMedia>
                                            <AlertDialogTitle>
                                                Delete Workspace?
                                            </AlertDialogTitle>
                                            <AlertDialogDescription>
                                                This action will schedule your
                                                workspace for deletion. You will
                                                have a{" "}
                                                <strong>
                                                    30-day retention period
                                                </strong>{" "}
                                                to restore your data before it
                                                is permanently removed.
                                            </AlertDialogDescription>
                                        </AlertDialogHeader>
                                        <div className="rounded-lg border bg-muted/30 p-4 space-y-3">
                                            <p className="text-sm font-medium">
                                                What will be deleted:
                                            </p>
                                            <ul className="text-sm text-muted-foreground space-y-1">
                                                <li className="flex items-center gap-2">
                                                    <XCircle className="h-4 w-4 text-destructive" />
                                                    All projects and boards
                                                </li>
                                                <li className="flex items-center gap-2">
                                                    <XCircle className="h-4 w-4 text-destructive" />
                                                    All tasks and comments
                                                </li>
                                                <li className="flex items-center gap-2">
                                                    <XCircle className="h-4 w-4 text-destructive" />
                                                    All uploaded files (2.4 GB)
                                                </li>
                                                <li className="flex items-center gap-2">
                                                    <XCircle className="h-4 w-4 text-destructive" />
                                                    All team member access
                                                </li>
                                            </ul>
                                        </div>
                                        <AlertDialogFooter>
                                            <AlertDialogCancel>
                                                Cancel
                                            </AlertDialogCancel>
                                            <Button
                                                variant="destructive"
                                                onClick={() =>
                                                    setRetentionStep("confirm")
                                                }
                                            >
                                                Continue
                                            </Button>
                                        </AlertDialogFooter>
                                    </>
                                )}

                                {retentionStep === "confirm" && (
                                    <>
                                        <AlertDialogHeader>
                                            <AlertDialogMedia className="bg-destructive/10">
                                                <Trash2 className="h-8 w-8 text-destructive" />
                                            </AlertDialogMedia>
                                            <AlertDialogTitle>
                                                Confirm Deletion
                                            </AlertDialogTitle>
                                            <AlertDialogDescription>
                                                Type{" "}
                                                <strong className="text-foreground">
                                                    DELETE
                                                </strong>{" "}
                                                to confirm workspace deletion.
                                                This cannot be undone after the
                                                retention period.
                                            </AlertDialogDescription>
                                        </AlertDialogHeader>
                                        <div className="space-y-2">
                                            <Label htmlFor="confirm-delete">
                                                Type DELETE to confirm
                                            </Label>
                                            <Input
                                                id="confirm-delete"
                                                placeholder="DELETE"
                                                value={deleteConfirmation}
                                                onChange={(e) =>
                                                    setDeleteConfirmation(
                                                        e.target.value
                                                    )
                                                }
                                                className="font-mono"
                                            />
                                        </div>
                                        <AlertDialogFooter>
                                            <Button
                                                variant="outline"
                                                onClick={() =>
                                                    setRetentionStep("initial")
                                                }
                                            >
                                                Back
                                            </Button>
                                            <Button
                                                variant="destructive"
                                                disabled={!isDeleteConfirmed}
                                                onClick={handleScheduleDeletion}
                                            >
                                                Schedule Deletion
                                            </Button>
                                        </AlertDialogFooter>
                                    </>
                                )}

                                {retentionStep === "scheduled" && (
                                    <>
                                        <AlertDialogHeader>
                                            <AlertDialogMedia className="bg-amber-100 dark:bg-amber-900/30">
                                                <Clock className="h-8 w-8 text-amber-600" />
                                            </AlertDialogMedia>
                                            <AlertDialogTitle>
                                                Deletion Scheduled
                                            </AlertDialogTitle>
                                            <AlertDialogDescription>
                                                Your workspace has been
                                                scheduled for deletion. You have{" "}
                                                <strong>30 days</strong> to
                                                restore your data if you change
                                                your mind.
                                            </AlertDialogDescription>
                                        </AlertDialogHeader>
                                        <div className="rounded-lg border bg-muted/30 p-4 space-y-2">
                                            <div className="flex justify-between text-sm">
                                                <span className="text-muted-foreground">
                                                    Scheduled deletion date
                                                </span>
                                                <span className="font-medium">
                                                    February 14, 2024
                                                </span>
                                            </div>
                                            <div className="flex justify-between text-sm">
                                                <span className="text-muted-foreground">
                                                    Workspace access
                                                </span>
                                                <span className="font-medium text-amber-600">
                                                    Read-only
                                                </span>
                                            </div>
                                        </div>
                                        <AlertDialogFooter>
                                            <AlertDialogAction>
                                                Got it
                                            </AlertDialogAction>
                                        </AlertDialogFooter>
                                    </>
                                )}
                            </AlertDialogContent>
                        </AlertDialog>
                    </div>
                </div>
            </div>
        </div>
    )
}
