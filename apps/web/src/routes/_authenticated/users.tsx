import { createFileRoute } from "@tanstack/react-router"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { useState } from "react"
import { Button } from "@tracky/web/components/ui/button"
import { Badge } from "@tracky/web/components/ui/badge"
import { Input } from "@tracky/web/components/ui/input"
import { Label } from "@tracky/web/components/ui/label"
import { Avatar, AvatarFallback, AvatarImage } from "@tracky/web/components/ui/avatar"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@tracky/web/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@tracky/web/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@tracky/web/components/ui/dropdown-menu"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@tracky/web/components/ui/select"
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
  UserPlus,
  MoreHorizontal,
  Mail,
  Shield,
  Trash2,
  Search,
  Users,
  Crown,
  User,
  Loader2,
  X,
  RotateCcw,
  CreditCard,
} from "lucide-react"
import { useApi } from "@tracky/web/hooks/use-api"
import { toast } from "sonner"

export const Route = createFileRoute("/_authenticated/users")({
  component: UsersPage,
})

type WorkspaceMember = {
  id: string
  userId: string
  email: string
  firstName: string | null
  lastName: string | null
  imageUrl: string | null
  role: "owner" | "admin" | "user"
  createdAt: number
  canManageBilling: boolean
}

type WorkspaceInvitation = {
  id: string
  email: string
  role: "admin" | "user"
  inviterName: string | null
  expiresAt: number
  createdAt: number
}

const PLAN_MEMBER_LIMITS = { free: 25, pro: Infinity } as const

function UsersPage() {
  const api = useApi()
  const queryClient = useQueryClient()
  const [searchQuery, setSearchQuery] = useState("")
  const [isInviteOpen, setIsInviteOpen] = useState(false)
  const [inviteEmail, setInviteEmail] = useState("")
  const [inviteRole, setInviteRole] = useState<"admin" | "user">("user")
  const [memberToRemove, setMemberToRemove] = useState<WorkspaceMember | null>(null)
  const [memberToChangeRole, setMemberToChangeRole] = useState<WorkspaceMember | null>(null)
  const [newRole, setNewRole] = useState<"admin" | "user">("user")
  const [invitationToRevoke, setInvitationToRevoke] = useState<WorkspaceInvitation | null>(null)
  const [resendingId, setResendingId] = useState<string | null>(null)

  // Get current user and workspace info
  const { data: authData } = useQuery({
    queryKey: ["auth", "me"],
    queryFn: async () => {
      const response = await api.auth.me.$get()
      if (!response.ok) throw new Error("Failed to fetch user")
      return response.json()
    },
  })

  const workspaceSlug = authData?.workspace?.slug
  const isAdmin = authData?.user?.role === "workspace_admin"
  const currentUserId = authData?.user?.id
  const currentUserIsOwner = authData?.ownsWorkspace ?? false

  // Fetch workspace members
  const { data: membersData, isLoading: membersLoading } = useQuery({
    queryKey: ["workspace", workspaceSlug, "members"],
    queryFn: async () => {
      if (!workspaceSlug) throw new Error("No workspace")
      const response = await api.workspaces[":slug"].members.$get({
        param: { slug: workspaceSlug },
      })
      if (!response.ok) throw new Error("Failed to fetch members")
      return response.json()
    },
    enabled: !!workspaceSlug,
  })

  // Fetch pending invitations (admin only)
  const { data: invitationsData } = useQuery({
    queryKey: ["workspace", workspaceSlug, "invitations"],
    queryFn: async () => {
      if (!workspaceSlug) throw new Error("No workspace")
      const response = await api.workspaces[":slug"].invitations.$get({
        param: { slug: workspaceSlug },
      })
      if (!response.ok) throw new Error("Failed to fetch invitations")
      return response.json()
    },
    enabled: !!workspaceSlug && isAdmin,
  })

  // Invite member mutation
  const inviteMember = useMutation({
    mutationFn: async ({ email, role }: { email: string; role: "admin" | "user" }) => {
      if (!workspaceSlug) throw new Error("No workspace")
      const response = await api.workspaces[":slug"].invitations.$post({
        param: { slug: workspaceSlug },
        json: { email, role },
      })
      if (!response.ok) {
        const error = (await response.json()) as { message?: string }
        throw new Error(error.message || "Failed to send invitation")
      }
      return response.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["workspace", workspaceSlug, "invitations"] })
      setIsInviteOpen(false)
      setInviteEmail("")
      setInviteRole("user")
    },
  })

  // Revoke invitation mutation
  const revokeInvitation = useMutation({
    mutationFn: async (invitationId: string) => {
      if (!workspaceSlug) throw new Error("No workspace")
      const response = await api.workspaces[":slug"].invitations[":invitationId"].$delete({
        param: { slug: workspaceSlug, invitationId },
      })
      if (!response.ok) throw new Error("Failed to revoke invitation")
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["workspace", workspaceSlug, "invitations"] })
      setInvitationToRevoke(null)
    },
  })

  // Update member role mutation
  const updateMemberRole = useMutation({
    mutationFn: async ({ userId, role }: { userId: string; role: "admin" | "user" }) => {
      if (!workspaceSlug) throw new Error("No workspace")
      const response = await api.workspaces[":slug"].members[":userId"].role.$patch({
        param: { slug: workspaceSlug, userId },
        json: { role },
      })
      if (!response.ok) {
        const error = (await response.json()) as { message?: string }
        throw new Error(error.message || "Failed to update role")
      }
      return response.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["workspace", workspaceSlug, "members"] })
      queryClient.invalidateQueries({ queryKey: ["auth", "me"] })
      setMemberToChangeRole(null)
    },
  })

  // Toggle billing permission mutation
  const toggleBillingPermission = useMutation({
    mutationFn: async ({ userId, canManageBilling }: { userId: string; canManageBilling: boolean }) => {
      if (!workspaceSlug) throw new Error("No workspace")
      const response = await api.workspaces[":slug"].members[":userId"]["billing-permission"].$patch({
        param: { slug: workspaceSlug, userId },
        json: { canManageBilling },
      })
      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.message || "Failed to update billing permission")
      }
      return response.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["workspace", workspaceSlug, "members"] })
      queryClient.invalidateQueries({ queryKey: ["auth", "me"] })
    },
  })

  // Remove member mutation
  const removeMember = useMutation({
    mutationFn: async (userId: string) => {
      if (!workspaceSlug) throw new Error("No workspace")
      const response = await api.workspaces[":slug"].members[":userId"].$delete({
        param: { slug: workspaceSlug, userId },
      })
      if (!response.ok) {
        const error = (await response.json()) as { message?: string }
        throw new Error(error.message || "Failed to remove member")
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["workspace", workspaceSlug, "members"] })
      setMemberToRemove(null)
    },
  })

  // Resend invitation handler
  const handleResend = async (invitationId: string, email: string) => {
    if (!workspaceSlug) return
    setResendingId(invitationId)
    try {
      const response = await fetch(
        `/api/workspaces/${workspaceSlug}/invitations/${invitationId}/resend`,
        { method: "POST", credentials: "include" },
      )
      if (!response.ok) {
        toast.error("Failed to resend invitation.")
        return
      }
      toast.success(`Invitation resent to ${email}.`)
      queryClient.invalidateQueries({ queryKey: ["workspace", workspaceSlug, "invitations"] })
    } catch {
      toast.error("Failed to resend invitation.")
    } finally {
      setResendingId(null)
    }
  }

  const members = membersData?.members ?? []
  const invitations = invitationsData?.invitations ?? []

  const plan = (authData?.workspace?.plan ?? "free") as "free" | "pro"
  const maxMembers = PLAN_MEMBER_LIMITS[plan]
  const activeCount = members.length
  const pendingCount = invitations.length

  // Filter members by search
  const filteredMembers = members.filter((member) => {
    const name = `${member.firstName || ""} ${member.lastName || ""}`.toLowerCase()
    const email = member.email.toLowerCase()
    const query = searchQuery.toLowerCase()
    return name.includes(query) || email.includes(query)
  })

  const getRoleIcon = (role: "owner" | "admin" | "user") => {
    if (role === "owner") return <Crown className="h-4 w-4 text-amber-500" />
    if (role === "admin") return <Shield className="h-4 w-4 text-primary" />
    return <User className="h-4 w-4 text-muted-foreground" />
  }

  const getRoleLabel = (role: "owner" | "admin" | "user") => {
    if (role === "owner") return "Owner"
    if (role === "admin") return "Admin"
    return "Member"
  }

  const getRoleBadgeStyle = (role: "owner" | "admin" | "user") => {
    if (role === "owner") return "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
    if (role === "admin") return "bg-primary/10 text-primary"
    return ""
  }

  const getMemberName = (member: WorkspaceMember) => {
    if (member.firstName || member.lastName) {
      return `${member.firstName || ""} ${member.lastName || ""}`.trim()
    }
    return member.email.split("@")[0]
  }

  const handleInviteSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (inviteEmail) {
      inviteMember.mutate({ email: inviteEmail, role: inviteRole })
    }
  }

  if (membersLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <h1 className="text-3xl font-bold tracking-tight">Team Members</h1>
          <p className="text-muted-foreground">
            {isAdmin
              ? "Manage access and roles for your workspace."
              : "View your workspace team members."}
            {maxMembers !== Infinity && (
              <span className="ml-2 text-sm">
                ({activeCount + pendingCount}/{maxMembers} members)
              </span>
            )}
          </p>
        </div>
        {isAdmin && (
          <Dialog open={isInviteOpen} onOpenChange={setIsInviteOpen}>
            <DialogTrigger asChild>
              <Button>
                <UserPlus className="mr-2 h-4 w-4" />
                Invite Member
              </Button>
            </DialogTrigger>
            <DialogContent>
              <form onSubmit={handleInviteSubmit}>
                <DialogHeader>
                  <DialogTitle>Invite Team Member</DialogTitle>
                  <DialogDescription>
                    Send an invitation email to add a new member to your workspace.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label htmlFor="email">Email Address</Label>
                    <Input
                      id="email"
                      type="email"
                      placeholder="colleague@company.com"
                      value={inviteEmail}
                      onChange={(e) => setInviteEmail(e.target.value)}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="role">Role</Label>
                    <Select value={inviteRole} onValueChange={(v) => setInviteRole(v as "admin" | "user")}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="user">Member</SelectItem>
                        <SelectItem value="admin">Admin</SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                      Admins can manage members and workspace settings.
                    </p>
                  </div>
                </div>
                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => setIsInviteOpen(false)}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={inviteMember.isPending || !inviteEmail}>
                    {inviteMember.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Send Invitation
                  </Button>
                </DialogFooter>
                {inviteMember.isError && (
                  <p className="text-sm text-destructive mt-2">{inviteMember.error.message}</p>
                )}
              </form>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <Users className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold">{activeCount + pendingCount}</p>
                <p className="text-sm text-muted-foreground">Total</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                <User className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{activeCount}</p>
                <p className="text-sm text-muted-foreground">Active</p>
              </div>
            </div>
          </CardContent>
        </Card>
        {isAdmin && (
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
                  <Mail className="h-5 w-5 text-amber-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{pendingCount}</p>
                  <p className="text-sm text-muted-foreground">Pending</p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Pending Invitations (Admin only) */}
      {isAdmin && invitations.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Pending Invitations</CardTitle>
            <CardDescription>
              {invitations.length} invitation{invitations.length !== 1 ? "s" : ""} awaiting response
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y divide-border">
              {invitations.map((invitation) => (
                <div
                  key={invitation.id}
                  className="flex items-center justify-between p-4 px-6 hover:bg-muted/50 transition-colors"
                >
                  <div className="flex items-center gap-4">
                    <Avatar className="h-10 w-10">
                      <AvatarFallback>
                        {invitation.email.charAt(0).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <div className="font-medium">{invitation.email}</div>
                      <div className="text-sm text-muted-foreground">
                        Invited as {invitation.role === "admin" ? "Admin" : "Member"}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <Badge variant="secondary" className="bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                      Pending
                    </Badge>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-muted-foreground hover:text-primary"
                      onClick={() => handleResend(invitation.id, invitation.email)}
                      disabled={resendingId === invitation.id}
                      aria-label="Resend invitation"
                    >
                      {resendingId === invitation.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <RotateCcw className="h-4 w-4" />
                      )}
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-muted-foreground hover:text-destructive"
                      onClick={() => setInvitationToRevoke(invitation)}
                      aria-label={`Revoke invitation for ${invitation.email}`}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Member List */}
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <CardTitle>All Members</CardTitle>
              <CardDescription>
                {activeCount} active member{activeCount !== 1 ? "s" : ""}
              </CardDescription>
            </div>
            <div className="relative w-full sm:w-64">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search members..."
                className="pl-9"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="divide-y divide-border">
            {filteredMembers.map((member) => {
              const isOwner = member.role === "owner"
              const isSelf = member.userId === currentUserId

              return (
                <div
                  key={member.id}
                  className="flex items-center justify-between p-4 px-6 hover:bg-muted/50 transition-colors"
                >
                  <div className="flex items-center gap-4">
                    <Avatar className="h-10 w-10">
                      <AvatarImage
                        src={member.imageUrl || `https://api.dicebear.com/7.x/initials/svg?seed=${getMemberName(member)}`}
                      />
                      <AvatarFallback>
                        {getMemberName(member).charAt(0).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <div className="font-medium">
                        {getMemberName(member)}
                        {isSelf && <span className="text-muted-foreground ml-2">(you)</span>}
                      </div>
                      <div className="text-sm text-muted-foreground">{member.email}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <Badge variant="secondary" className={getRoleBadgeStyle(member.role)}>
                      <span className="mr-1">{getRoleIcon(member.role)}</span>
                      {getRoleLabel(member.role)}
                    </Badge>
                    {member.canManageBilling && !isOwner && (
                      <Badge variant="outline" className="text-xs">
                        <CreditCard className="mr-1 h-3 w-3" />
                        Billing
                      </Badge>
                    )}
                    {isAdmin && !isOwner && !isSelf && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <MoreHorizontal className="h-4 w-4 text-muted-foreground" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            onClick={() => {
                              setMemberToChangeRole(member)
                              setNewRole(member.role === "admin" ? "user" : "admin")
                            }}
                          >
                            <Shield className="mr-2 h-4 w-4" />
                            {member.role === "admin" ? "Demote to Member" : "Promote to Admin"}
                          </DropdownMenuItem>
                          {currentUserIsOwner && (
                            <DropdownMenuItem
                              onClick={() => toggleBillingPermission.mutate({
                                userId: member.userId,
                                canManageBilling: !member.canManageBilling,
                              })}
                              disabled={toggleBillingPermission.isPending}
                            >
                              <CreditCard className="mr-2 h-4 w-4" />
                              {member.canManageBilling ? "Revoke Billing Access" : "Grant Billing Access"}
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            className="text-destructive focus:text-destructive"
                            onClick={() => setMemberToRemove(member)}
                          >
                            <Trash2 className="mr-2 h-4 w-4" />
                            Remove from Workspace
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                    {isOwner && (
                      <Badge variant="outline" className="text-xs">
                        <Crown className="mr-1 h-3 w-3" />
                        Owner
                      </Badge>
                    )}
                  </div>
                </div>
              )
            })}
            {filteredMembers.length === 0 && (
              <div className="p-8 text-center text-muted-foreground">
                No members found matching your search.
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Remove Member Confirmation */}
      <AlertDialog open={!!memberToRemove} onOpenChange={(open) => !open && setMemberToRemove(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Team Member</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to remove <strong>{memberToRemove && getMemberName(memberToRemove)}</strong> from this workspace?
              They will lose access to all boards and tasks.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => memberToRemove && removeMember.mutate(memberToRemove.userId)}
              disabled={removeMember.isPending}
            >
              {removeMember.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Remove Member
            </AlertDialogAction>
          </AlertDialogFooter>
          {removeMember.isError && (
            <p className="text-sm text-destructive mt-2">{removeMember.error.message}</p>
          )}
        </AlertDialogContent>
      </AlertDialog>

      {/* Change Role Confirmation */}
      <AlertDialog open={!!memberToChangeRole} onOpenChange={(open) => !open && setMemberToChangeRole(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Change Member Role</AlertDialogTitle>
            <AlertDialogDescription>
              {newRole === "admin" ? (
                <>
                  Promote <strong>{memberToChangeRole && getMemberName(memberToChangeRole)}</strong> to Admin?
                  They will be able to manage members and workspace settings.
                </>
              ) : (
                <>
                  Demote <strong>{memberToChangeRole && getMemberName(memberToChangeRole)}</strong> to Member?
                  They will no longer be able to manage members or workspace settings.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => memberToChangeRole && updateMemberRole.mutate({ userId: memberToChangeRole.userId, role: newRole })}
              disabled={updateMemberRole.isPending}
            >
              {updateMemberRole.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {newRole === "admin" ? "Promote to Admin" : "Demote to Member"}
            </AlertDialogAction>
          </AlertDialogFooter>
          {updateMemberRole.isError && (
            <p className="text-sm text-destructive mt-2">{updateMemberRole.error.message}</p>
          )}
        </AlertDialogContent>
      </AlertDialog>

      {/* Revoke Invitation Confirmation */}
      <AlertDialog open={!!invitationToRevoke} onOpenChange={(open) => !open && setInvitationToRevoke(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revoke Invitation</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to revoke the invitation sent to <strong>{invitationToRevoke?.email}</strong>?
              They will no longer be able to join with this link.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => invitationToRevoke && revokeInvitation.mutate(invitationToRevoke.id)}
              disabled={revokeInvitation.isPending}
            >
              {revokeInvitation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Revoke Invitation
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
