import { useState, useEffect, useRef } from "react"
import { createFileRoute } from "@tanstack/react-router"
import { toast } from "sonner"
import { useQueryClient } from "@tanstack/react-query"
import { Button } from "@tracky/web/components/ui/button"
import { Input } from "@tracky/web/components/ui/input"
import { Label } from "@tracky/web/components/ui/label"
import { Separator } from "@tracky/web/components/ui/separator"
import { Badge } from "@tracky/web/components/ui/badge"
import { Avatar, AvatarFallback, AvatarImage } from "@tracky/web/components/ui/avatar"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@tracky/web/components/ui/tabs"
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
    Bell,
    CreditCard,
    HardDrive,
    Users,
    Trash2,
    AlertTriangle,
    Shield,
    Clock,
    CheckCircle2,
    XCircle,
    Loader2,
    Upload,
    User,
} from "lucide-react"
import {
    useWorkspaceSettings,
    useUpdateWorkspaceSettings,
    useWorkspaceAuditLogs,
    useCreateCheckout,
    useCancelSubscription,
} from "@tracky/web/hooks/use-workspace-settings"
import { Switch } from "@tracky/web/components/ui/switch"
import { useNotificationPreferences, useUpdateNotificationPreferences } from "@tracky/web/hooks/use-notification-preferences"
import { useApi } from "@tracky/web/hooks/use-api"
import { useQuery } from "@tanstack/react-query"
import { authManager } from "@tracky/web/lib/auth-manager"

interface AuditLogEntry {
    id: string
    actorId: string
    action: string
    resourceType: string
    resourceId: string | null
    metadata: unknown
    createdAt: string
    actorEmail: string | null
}

export const Route = createFileRoute("/_authenticated/settings")({
    component: SettingsPage,
    validateSearch: (search: Record<string, unknown>) => ({
        billing: (search.billing as string) || undefined,
    }),
})

function formatBytes(bytes: number): string {
    if (bytes === 0) return "0 B"
    const units = ["B", "KB", "MB", "GB", "TB"]
    const i = Math.floor(Math.log(bytes) / Math.log(1024))
    const value = bytes / Math.pow(1024, i)
    return `${value.toFixed(value < 10 && i > 0 ? 1 : 0)} ${units[i]}`
}

function formatAuditAction(action: string): string {
    return action.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase())
}

// Profile Tab Content
function ProfileContent() {
    const { data: authData } = useWorkspaceSettings()
    const queryClient = useQueryClient()
    const user = authData?.user
    const workspace = authData?.workspace

    const [firstName, setFirstName] = useState(user?.firstName ?? "")
    const [lastName, setLastName] = useState(user?.lastName ?? "")
    const [avatarFile, setAvatarFile] = useState<File | null>(null)
    const [avatarPreview, setAvatarPreview] = useState<string | null>(null)
    const [isSaving, setIsSaving] = useState(false)

    const fileInputRef = useRef<HTMLInputElement>(null)
    const prevPreviewRef = useRef<string | null>(null)

    // Sync form state when user data loads/updates
    useEffect(() => {
        if (user?.firstName !== undefined) setFirstName(user.firstName ?? "")
        if (user?.lastName !== undefined) setLastName(user.lastName ?? "")
    }, [user?.firstName, user?.lastName])

    // Cleanup object URLs on unmount
    useEffect(() => {
        return () => {
            if (prevPreviewRef.current) {
                URL.revokeObjectURL(prevPreviewRef.current)
            }
        }
    }, [])

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (!file) return

        // Validate size (2 MB max)
        if (file.size > 2 * 1024 * 1024) {
            toast.error("File must be under 2 MB")
            // Reset input
            if (fileInputRef.current) fileInputRef.current.value = ""
            return
        }

        // Validate MIME type
        const allowedTypes = ["image/jpeg", "image/png", "image/webp"]
        if (!allowedTypes.includes(file.type)) {
            toast.error("Only JPEG, PNG, and WebP images are supported")
            if (fileInputRef.current) fileInputRef.current.value = ""
            return
        }

        // Revoke old preview
        if (prevPreviewRef.current) {
            URL.revokeObjectURL(prevPreviewRef.current)
        }

        const previewUrl = URL.createObjectURL(file)
        prevPreviewRef.current = previewUrl
        setAvatarFile(file)
        setAvatarPreview(previewUrl)
    }

    const handleSave = async () => {
        const hasNameChange = firstName !== (user?.firstName ?? "") || lastName !== (user?.lastName ?? "")
        const hasAvatarChange = avatarFile !== null

        if (!hasNameChange && !hasAvatarChange) {
            toast.info("No changes to save.")
            return
        }

        setIsSaving(true)
        try {
            // Upload avatar first if changed
            if (hasAvatarChange && avatarFile) {
                const formData = new FormData()
                formData.append("file", avatarFile)
                const avatarRes = await fetch("/api/auth/avatar", {
                    method: "POST",
                    body: formData,
                    credentials: "include",
                    headers: { "Authorization": `Bearer ${authManager.getToken()}` },
                })
                if (!avatarRes.ok) {
                    const err = await avatarRes.json() as { message?: string }
                    throw new Error(err.message ?? "Failed to upload avatar")
                }
            }

            // Update name if changed
            if (hasNameChange) {
                const profileRes = await fetch("/api/auth/profile", {
                    method: "PATCH",
                    body: JSON.stringify({ firstName, lastName }),
                    headers: {
                        "Content-Type": "application/json",
                        "Authorization": `Bearer ${authManager.getToken()}`,
                    },
                    credentials: "include",
                })
                if (!profileRes.ok) {
                    const err = await profileRes.json() as { message?: string }
                    throw new Error(err.message ?? "Failed to update profile")
                }
            }

            // Invalidate queries so all components reflect new data
            await queryClient.invalidateQueries({ queryKey: ["auth", "me"] })
            if (workspace?.slug) {
                await queryClient.invalidateQueries({ queryKey: ["workspace", workspace.slug, "members"] })
            }

            // Clear the pending avatar file
            setAvatarFile(null)
            setAvatarPreview(null)
            if (prevPreviewRef.current) {
                URL.revokeObjectURL(prevPreviewRef.current)
                prevPreviewRef.current = null
            }
            if (fileInputRef.current) fileInputRef.current.value = ""

            toast.success("Profile updated.")
        } catch (err) {
            const message = err instanceof Error ? err.message : "Failed to update profile"
            toast.error(message)
        } finally {
            setIsSaving(false)
        }
    }

    const currentAvatarSrc = avatarPreview ?? user?.avatarUrl ?? user?.imageUrl ?? undefined

    const userInitials = user?.firstName && user?.lastName
        ? `${user.firstName[0]}${user.lastName[0]}`
        : user?.email?.[0]?.toUpperCase() ?? "U"

    const hasChanges =
        firstName !== (user?.firstName ?? "") ||
        lastName !== (user?.lastName ?? "") ||
        avatarFile !== null

    return (
        <div className="space-y-6">
            <div className="space-y-1">
                <h2 className="text-2xl font-bold tracking-tight">Profile</h2>
                <p className="text-muted-foreground">
                    Manage your personal information and avatar.
                </p>
            </div>

            <Card>
                <CardHeader>
                    <div className="flex items-center gap-2">
                        <User className="h-5 w-5 text-muted-foreground" />
                        <CardTitle>Personal Information</CardTitle>
                    </div>
                    <CardDescription>
                        Update your name and profile picture.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                    {/* Avatar section */}
                    <div className="flex items-center gap-6">
                        <Avatar className="h-20 w-20">
                            <AvatarImage src={currentAvatarSrc} alt={user?.firstName ?? "User"} />
                            <AvatarFallback className="text-lg">{userInitials}</AvatarFallback>
                        </Avatar>
                        <div className="space-y-2">
                            <p className="text-sm font-medium">Profile Picture</p>
                            <p className="text-xs text-muted-foreground">
                                JPEG, PNG, or WebP. Max 2 MB.
                            </p>
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => fileInputRef.current?.click()}
                                disabled={isSaving}
                            >
                                <Upload className="h-4 w-4 mr-2" />
                                {avatarFile ? "Change Image" : "Upload Image"}
                            </Button>
                            {avatarFile && (
                                <p className="text-xs text-muted-foreground">
                                    Selected: {avatarFile.name}
                                </p>
                            )}
                            <input
                                ref={fileInputRef}
                                type="file"
                                accept="image/jpeg,image/png,image/webp"
                                className="hidden"
                                onChange={handleFileSelect}
                            />
                        </div>
                    </div>

                    <Separator />

                    {/* Name fields */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                            <Label htmlFor="firstName">First Name</Label>
                            <Input
                                id="firstName"
                                value={firstName}
                                onChange={(e) => setFirstName(e.target.value)}
                                placeholder="Enter first name"
                                disabled={isSaving}
                            />
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor="lastName">Last Name</Label>
                            <Input
                                id="lastName"
                                value={lastName}
                                onChange={(e) => setLastName(e.target.value)}
                                placeholder="Enter last name"
                                disabled={isSaving}
                            />
                        </div>
                    </div>

                    {/* Email (read-only) */}
                    <div className="space-y-1.5">
                        <Label htmlFor="email">Email</Label>
                        <Input
                            id="email"
                            value={user?.email ?? ""}
                            readOnly
                            disabled
                            className="bg-muted/50 cursor-not-allowed"
                        />
                        <p className="text-xs text-muted-foreground">
                            Email cannot be changed here.
                        </p>
                    </div>

                    <Button
                        onClick={handleSave}
                        disabled={!hasChanges || isSaving}
                        className="w-fit"
                    >
                        {isSaving ? (
                            <Loader2 className="h-4 w-4 animate-spin mr-2" />
                        ) : null}
                        Save Changes
                    </Button>
                </CardContent>
            </Card>
        </div>
    )
}

// Workspace Settings Tab Content (moved from original SettingsPage)
function WorkspaceSettingsContent() {
    const { data: authData } = useWorkspaceSettings()
    const workspace = authData?.workspace
    const updateSettings = useUpdateWorkspaceSettings()
    const createCheckout = useCreateCheckout()
    const cancelSubscription = useCancelSubscription()
    const { billing } = Route.useSearch()

    // Use a key derived from workspace data to reset form state when data changes
    const workspaceKey = `${workspace?.name}:${workspace?.slug}`
    const [nameOverride, setNameOverride] = useState<{ key: string; value: string } | null>(null)
    const [slugOverride, setSlugOverride] = useState<{ key: string; value: string } | null>(null)

    const name = nameOverride?.key === workspaceKey ? nameOverride.value : (workspace?.name ?? "")
    const slug = slugOverride?.key === workspaceKey ? slugOverride.value : (workspace?.slug ?? "")
    const setName = (v: string) => setNameOverride({ key: workspaceKey, value: v })
    const setSlug = (v: string) => setSlugOverride({ key: workspaceKey, value: v })

    const [auditPage, setAuditPage] = useState(1)

    const { data: auditData, isLoading: isAuditLoading } = useWorkspaceAuditLogs(
        workspace?.slug ?? "",
        { page: auditPage, limit: 10 },
    )

    // Fetch member count
    const api = useApi()
    const { data: membersData } = useQuery({
        queryKey: ["workspace", workspace?.slug, "members"],
        queryFn: async () => {
            const response = await api.workspaces[":slug"].members.$get({
                param: { slug: workspace!.slug },
            })
            if (!response.ok) throw new Error("Failed to fetch members")
            return response.json()
        },
        enabled: !!workspace?.slug,
    })

    // Handle billing redirect query params
    useEffect(() => {
        if (billing === "success") {
            toast.success("Payment successful! Your workspace is now on Pro.")
        } else if (billing === "failed") {
            toast.error("Payment failed. Please try again.")
        } else if (billing === "cancelled") {
            toast.info("Payment cancelled.")
        }
    }, [billing])

    const handleUpgrade = async () => {
        if (!workspace) return
        try {
            const result = await createCheckout.mutateAsync({ slug: workspace.slug })
            window.location.href = result.checkoutUrl
        } catch {
            toast.error("Failed to create checkout session")
        }
    }

    const handleCancelSubscription = async () => {
        if (!workspace) return
        try {
            await cancelSubscription.mutateAsync({ slug: workspace.slug })
            toast.success("Subscription cancelled. Pro features available until your billing period ends.")
        } catch {
            toast.error("Failed to cancel subscription")
        }
    }

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

    const handleSaveSettings = () => {
        if (!workspace) return
        const changes: { slug: string; name?: string; newSlug?: string } = { slug: workspace.slug }
        if (name !== workspace.name) changes.name = name
        if (slug !== workspace.slug) changes.newSlug = slug
        if (!changes.name && !changes.newSlug) return
        updateSettings.mutate(changes)
    }

    if (!workspace) {
        return (
            <div className="flex items-center justify-center py-20">
                <p className="text-muted-foreground">No workspace found.</p>
            </div>
        )
    }

    const storageUsed = workspace.storageUsedBytes ?? 0
    const storageQuota = workspace.storageQuotaBytes ?? 10737418240
    const storagePercent = storageQuota > 0 ? Math.round((storageUsed / storageQuota) * 100) : 0
    const storageRemaining = storageQuota - storageUsed
    const memberCount = membersData?.totalCount ?? 0

    const hasChanges = name !== workspace.name || slug !== workspace.slug

    return (
        <div className="space-y-8 animate-in fade-in duration-500">
            <div className="space-y-1">
                <div className="flex items-center gap-2">
                    <h2 className="text-2xl font-bold tracking-tight">
                        Workspace Settings
                    </h2>
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
                            <Label htmlFor="ws-name">Display Name</Label>
                            <Input
                                id="ws-name"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                            />
                        </div>
                        <div className="grid w-full items-center gap-1.5">
                            <Label htmlFor="ws-slug">URL Slug</Label>
                            <div className="flex items-center gap-2">
                                <span className="text-muted-foreground text-sm">
                                    tracky.app/
                                </span>
                                <Input
                                    id="ws-slug"
                                    value={slug}
                                    onChange={(e) => setSlug(e.target.value)}
                                    className="max-w-[200px]"
                                />
                            </div>
                            <p className="text-xs text-muted-foreground">
                                This is your workspace's unique URL identifier.
                            </p>
                        </div>
                        {updateSettings.isError && (
                            <p className="text-sm text-destructive">
                                {updateSettings.error.message}
                            </p>
                        )}
                        <Button
                            className="w-fit"
                            onClick={handleSaveSettings}
                            disabled={!hasChanges || updateSettings.isPending}
                        >
                            {updateSettings.isPending ? (
                                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                            ) : null}
                            Save Changes
                        </Button>
                    </CardContent>
                </Card>

                {/* Storage Usage */}
                <Card>
                    <CardHeader>
                        <div className="flex items-center gap-2">
                            <HardDrive className="h-5 w-5 text-muted-foreground" />
                            <CardTitle>Storage Usage</CardTitle>
                            <Badge variant="outline">{formatBytes(storageQuota)} Plan</Badge>
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
                                    {formatBytes(storageUsed)} / {formatBytes(storageQuota)}
                                </span>
                            </div>
                            <div className="h-3 w-full bg-secondary rounded-full overflow-hidden">
                                <div
                                    className="h-full bg-primary transition-all"
                                    style={{ width: `${storagePercent}%` }}
                                />
                            </div>
                            <p className="text-xs text-muted-foreground">
                                {formatBytes(storageRemaining)} remaining • Includes files, attachments,
                                and backups
                            </p>
                        </div>
                        <Separator />
                        <div className="space-y-3">
                            <div className="flex justify-between text-sm">
                                <span className="font-medium flex items-center gap-2">
                                    <Users className="h-4 w-4 text-muted-foreground" />
                                    Members
                                </span>
                                <span className="text-muted-foreground">
                                    {memberCount} Active
                                </span>
                            </div>
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

                {/* Billing Info / Subscription - Full width (visible to users with billing permission) */}
                {(authData?.canManageBilling || authData?.ownsWorkspace) && <Card className="lg:col-span-2">
                    <CardHeader>
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <CreditCard className="h-5 w-5 text-muted-foreground" />
                                <CardTitle>Billing & Subscription</CardTitle>
                            </div>
                            {workspace.subscriptionStatus === "active" && (
                                <Badge className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
                                    Active
                                </Badge>
                            )}
                            {workspace.subscriptionStatus === "cancelling" && (
                                <Badge variant="secondary">Cancelling</Badge>
                            )}
                            {workspace.subscriptionStatus === "past_due" && (
                                <Badge variant="destructive">Past Due</Badge>
                            )}
                            {workspace.subscriptionStatus === "none" && (
                                <Badge variant="outline">Free</Badge>
                            )}
                        </div>
                        <CardDescription>
                            Manage your subscription plan and payment methods.
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        {/* Past due warning */}
                        {workspace.subscriptionStatus === "past_due" && (
                            <div className="mb-4 rounded-lg border border-destructive/50 bg-destructive/10 p-4 flex items-start gap-3">
                                <AlertTriangle className="h-5 w-5 text-destructive mt-0.5" />
                                <div className="space-y-1">
                                    <p className="font-medium text-destructive">Payment Failed</p>
                                    <p className="text-sm text-destructive/80">
                                        Your last payment failed. Your workspace has been downgraded to the Free plan.
                                        Retry payment to restore Pro features.
                                    </p>
                                </div>
                            </div>
                        )}

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            {/* Current Plan */}
                            <div className="rounded-lg border bg-muted/30 p-4 space-y-3">
                                <div className="flex items-center justify-between">
                                    <h4 className="font-semibold">
                                        {workspace.plan === "pro" ? "Pro Plan" : "Free Plan"}
                                    </h4>
                                    <Badge variant={workspace.plan === "pro" ? "default" : "secondary"}>
                                        {workspace.plan === "pro" ? "Pro" : "Free"}
                                    </Badge>
                                </div>
                                {workspace.plan === "pro" ? (
                                    <p className="text-sm text-muted-foreground">
                                        Unlimited boards and members, {formatBytes(storageQuota)} storage
                                    </p>
                                ) : (
                                    <ul className="text-sm text-muted-foreground space-y-1">
                                        <li>Up to 5 boards</li>
                                        <li>Up to 25 members</li>
                                        <li>{formatBytes(storageQuota)} storage</li>
                                    </ul>
                                )}

                                {/* Free plan + no subscription = show upgrade */}
                                {workspace.subscriptionStatus === "none" && workspace.plan === "free" && (
                                    <Button
                                        onClick={handleUpgrade}
                                        disabled={createCheckout.isPending}
                                        className="w-full"
                                    >
                                        {createCheckout.isPending && (
                                            <Loader2 className="h-4 w-4 animate-spin mr-2" />
                                        )}
                                        Upgrade to Pro — RM 49/month
                                    </Button>
                                )}

                                {/* Past due = show retry */}
                                {workspace.subscriptionStatus === "past_due" && (
                                    <Button
                                        onClick={handleUpgrade}
                                        disabled={createCheckout.isPending}
                                        className="w-full"
                                    >
                                        {createCheckout.isPending && (
                                            <Loader2 className="h-4 w-4 animate-spin mr-2" />
                                        )}
                                        Retry Payment
                                    </Button>
                                )}

                                {/* Cancelling = show message */}
                                {workspace.subscriptionStatus === "cancelling" && (
                                    <div className="text-sm space-y-1">
                                        <p className="text-muted-foreground">
                                            Pro until {workspace.billingPeriodEnd
                                                ? new Date(workspace.billingPeriodEnd).toLocaleDateString()
                                                : "—"}
                                        </p>
                                        <p className="text-xs text-muted-foreground">
                                            Your subscription will not renew.
                                        </p>
                                    </div>
                                )}
                            </div>

                            {/* Billing Details / Type */}
                            <div className="rounded-lg border bg-muted/30 p-4 space-y-3">
                                {workspace.subscriptionStatus === "active" ? (
                                    <>
                                        <h4 className="font-semibold">Billing Period</h4>
                                        <div className="text-sm text-muted-foreground space-y-1">
                                            <div className="flex justify-between">
                                                <span>Current period</span>
                                                <span>
                                                    {workspace.billingPeriodStart
                                                        ? new Date(workspace.billingPeriodStart).toLocaleDateString()
                                                        : "—"}{" "}
                                                    —{" "}
                                                    {workspace.billingPeriodEnd
                                                        ? new Date(workspace.billingPeriodEnd).toLocaleDateString()
                                                        : "—"}
                                                </span>
                                            </div>
                                            <div className="flex justify-between">
                                                <span>Next renewal</span>
                                                <span>
                                                    {workspace.billingPeriodEnd
                                                        ? new Date(workspace.billingPeriodEnd).toLocaleDateString()
                                                        : "—"}
                                                </span>
                                            </div>
                                        </div>
                                        <AlertDialog>
                                            <AlertDialogTrigger asChild>
                                                <Button variant="outline" size="sm" className="w-full">
                                                    Cancel Subscription
                                                </Button>
                                            </AlertDialogTrigger>
                                            <AlertDialogContent>
                                                <AlertDialogHeader>
                                                    <AlertDialogTitle>Cancel Subscription?</AlertDialogTitle>
                                                    <AlertDialogDescription>
                                                        Your workspace will remain on Pro until the end of the current billing period
                                                        ({workspace.billingPeriodEnd
                                                            ? new Date(workspace.billingPeriodEnd).toLocaleDateString()
                                                            : "—"}).
                                                        After that, it will be downgraded to the Free plan.
                                                    </AlertDialogDescription>
                                                </AlertDialogHeader>
                                                <AlertDialogFooter>
                                                    <AlertDialogCancel>Keep Subscription</AlertDialogCancel>
                                                    <AlertDialogAction
                                                        onClick={handleCancelSubscription}
                                                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                                    >
                                                        {cancelSubscription.isPending && (
                                                            <Loader2 className="h-4 w-4 animate-spin mr-2" />
                                                        )}
                                                        Cancel Subscription
                                                    </AlertDialogAction>
                                                </AlertDialogFooter>
                                            </AlertDialogContent>
                                        </AlertDialog>
                                    </>
                                ) : (
                                    <>
                                        <div className="flex items-center justify-between">
                                            <h4 className="font-semibold">Billing Type</h4>
                                            <Badge variant="outline">
                                                {workspace.billingType === "retainer" ? "Retainer" : "Subscription"}
                                            </Badge>
                                        </div>
                                        <p className="text-sm text-muted-foreground">
                                            {workspace.billingType === "retainer"
                                                ? "This workspace is managed under a retainer agreement."
                                                : "This workspace uses a subscription billing model."}
                                        </p>
                                    </>
                                )}
                            </div>
                        </div>
                    </CardContent>
                </Card>}

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
                            Security events and workspace activity logs.
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="rounded-lg border overflow-hidden">
                            {/* Table Header - Hidden on mobile */}
                            <div className="hidden md:grid md:grid-cols-[1fr_1.5fr_1fr_1fr] gap-4 p-3 bg-muted/50 text-sm font-medium text-muted-foreground border-b">
                                <span>Action</span>
                                <span>Details</span>
                                <span>User</span>
                                <span>Timestamp</span>
                            </div>
                            <div className="divide-y">
                                {isAuditLoading ? (
                                    <div className="flex items-center justify-center py-8">
                                        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                                    </div>
                                ) : auditData?.logs && auditData.logs.length > 0 ? (
                                    (auditData.logs as AuditLogEntry[]).map((log) => (
                                        <div
                                            key={log.id}
                                            className="grid grid-cols-1 md:grid-cols-[1fr_1.5fr_1fr_1fr] gap-2 md:gap-4 p-4 hover:bg-muted/30 transition-colors items-center"
                                        >
                                            <div className="flex items-center gap-2">
                                                <CheckCircle2 className="h-4 w-4 text-green-600 md:hidden" />
                                                <p className="font-medium text-sm">
                                                    {formatAuditAction(log.action)}
                                                </p>
                                            </div>
                                            <p className="text-sm text-muted-foreground">
                                                {log.metadata && typeof log.metadata === "object"
                                                    ? JSON.stringify(log.metadata)
                                                    : "—"}
                                            </p>
                                            <p className="text-sm text-muted-foreground flex items-center gap-1">
                                                <Users className="h-3 w-3 md:hidden" />
                                                {log.actorEmail ?? "Unknown"}
                                            </p>
                                            <p className="text-sm text-muted-foreground flex items-center gap-1">
                                                <Clock className="h-3 w-3 md:hidden" />
                                                {new Date(log.createdAt).toLocaleString()}
                                            </p>
                                        </div>
                                    ))
                                ) : (
                                    <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
                                        No audit logs yet.
                                    </div>
                                )}
                            </div>
                        </div>
                        {auditData && auditData.totalCount > auditData.limit && (
                            <div className="mt-4 flex justify-center gap-2">
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    disabled={auditPage <= 1}
                                    onClick={() => setAuditPage(p => p - 1)}
                                >
                                    Previous
                                </Button>
                                <span className="flex items-center text-sm text-muted-foreground">
                                    Page {auditPage} of {Math.ceil(auditData.totalCount / auditData.limit)}
                                </span>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    disabled={auditPage >= Math.ceil(auditData.totalCount / auditData.limit)}
                                    onClick={() => setAuditPage(p => p + 1)}
                                >
                                    Next
                                </Button>
                            </div>
                        )}
                    </CardContent>
                </Card>

                {/* Danger Zone - Delete Workspace - Full width (owner only) */}
                {authData?.ownsWorkspace && <div className="lg:col-span-2 border border-destructive/20 rounded-lg p-6 bg-destructive/5 space-y-4">
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
                                                    All uploaded files ({formatBytes(storageUsed)})
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
                </div>}
            </div>
        </div>
    )
}

function NotificationsContent() {
    const { data: preferences, isLoading, isError } = useNotificationPreferences()
    const updatePreferences = useUpdateNotificationPreferences()

    const handleToggle = (field: "taskNotifications" | "collaborationNotifications" | "adminNotifications", value: boolean) => {
        if (!preferences) return
        updatePreferences.mutate({
            ...preferences,
            [field]: value,
        })
    }

    if (isLoading) {
        return (
            <div className="space-y-4">
                {[1, 2, 3].map(i => (
                    <Card key={i} className="animate-pulse">
                        <CardHeader>
                            <div className="h-5 bg-muted rounded w-48" />
                            <div className="h-4 bg-muted rounded w-72 mt-2" />
                        </CardHeader>
                        <CardContent><div className="h-6 bg-muted rounded w-12" /></CardContent>
                    </Card>
                ))}
            </div>
        )
    }

    if (isError || !preferences) {
        return (
            <Card>
                <CardContent className="py-8 text-center text-muted-foreground">
                    Failed to load notification preferences. Please refresh the page.
                </CardContent>
            </Card>
        )
    }

    const categories = [
        {
            field: "taskNotifications" as const,
            title: "Task Notifications",
            description: "Assignment, updates, due dates, overdue reminders",
        },
        {
            field: "collaborationNotifications" as const,
            title: "Comments & Collaboration",
            description: "Mentions, comments, attachments",
        },
        {
            field: "adminNotifications" as const,
            title: "Workspace & Admin",
            description: "Member joins, role changes, board changes",
        },
    ]

    return (
        <div className="space-y-4">
            <div className="space-y-1">
                <h3 className="text-lg font-medium">Email Notifications</h3>
                <p className="text-sm text-muted-foreground">
                    Choose which email notifications you receive.
                </p>
            </div>
            {categories.map(({ field, title, description }) => (
                <Card key={field}>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <div className="space-y-1">
                            <CardTitle className="text-base">{title}</CardTitle>
                            <CardDescription>{description}</CardDescription>
                        </div>
                        <Switch
                            checked={preferences[field]}
                            onCheckedChange={(checked) => handleToggle(field, checked)}
                        />
                    </CardHeader>
                </Card>
            ))}
        </div>
    )
}

function SettingsPage() {
    const { data: authData, isLoading: isAuthLoading } = useWorkspaceSettings()
    const user = authData?.user
    const userRole = user?.role ?? "member"
    const isAdmin = userRole === "workspace_admin"

    // Detect #notifications hash for deep-link (per D-09)
    const [activeTab, setActiveTab] = useState(() => {
        if (typeof window !== "undefined" && window.location.hash === "#notifications") {
            return "notifications"
        }
        return "profile"
    })

    // Also listen for hash changes (e.g., user clicks email link while already on settings)
    useEffect(() => {
        const handleHashChange = () => {
            if (window.location.hash === "#notifications") {
                setActiveTab("notifications")
            }
        }
        window.addEventListener("hashchange", handleHashChange)
        return () => window.removeEventListener("hashchange", handleHashChange)
    }, [])

    if (isAuthLoading) {
        return (
            <div className="flex items-center justify-center py-20">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
        )
    }

    return (
        <div className="space-y-6 animate-in fade-in duration-500">
            <div className="space-y-1">
                <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
                <p className="text-muted-foreground">
                    Manage your account and workspace settings.
                </p>
            </div>

            <Tabs value={activeTab} onValueChange={setActiveTab}>
                <TabsList>
                    {isAdmin && (
                        <TabsTrigger value="workspace">Workspace Settings</TabsTrigger>
                    )}
                    <TabsTrigger value="profile">Profile</TabsTrigger>
                    <TabsTrigger value="notifications">
                        <Bell className="h-4 w-4 mr-1" />
                        Notifications
                    </TabsTrigger>
                </TabsList>

                {isAdmin && (
                    <TabsContent value="workspace" className="mt-6">
                        <WorkspaceSettingsContent />
                    </TabsContent>
                )}

                <TabsContent value="profile" className="mt-6">
                    <ProfileContent />
                </TabsContent>

                <TabsContent value="notifications" className="mt-6">
                    <NotificationsContent />
                </TabsContent>
            </Tabs>
        </div>
    )
}
