import { createFileRoute } from "@tanstack/react-router"
import { Button } from "@tracky/web/components/ui/button"
import { Badge } from "@tracky/web/components/ui/badge"
import { Input } from "@tracky/web/components/ui/input"
import { Avatar, AvatarFallback, AvatarImage } from "@tracky/web/components/ui/avatar"
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from "@tracky/web/components/ui/card"
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@tracky/web/components/ui/dropdown-menu"
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
} from "lucide-react"

export const Route = createFileRoute("/_authenticated/users")({
    component: UsersPage,
})

type TeamMember = {
    id: number
    name: string
    email: string
    role: "Owner" | "Admin" | "Member"
    status: "Active" | "Pending"
    avatar?: string
}

const mockUsers: TeamMember[] = [
    {
        id: 1,
        name: "Ridwan Admin",
        email: "ridhwan@tracky.com",
        role: "Owner",
        status: "Active",
    },
    {
        id: 2,
        name: "Sarah Connor",
        email: "sarah@tracky.com",
        role: "Admin",
        status: "Active",
    },
    {
        id: 3,
        name: "John Doe",
        email: "john@tracky.com",
        role: "Member",
        status: "Active",
    },
    {
        id: 4,
        name: "Jane Smith",
        email: "jane@tracky.com",
        role: "Member",
        status: "Pending",
    },
]

function UsersPage() {
    // TODO: Replace with actual auth context
    const isAdmin = true // Mock: set to false to test member view

    const activeCount = mockUsers.filter((u) => u.status === "Active").length
    const pendingCount = mockUsers.filter((u) => u.status === "Pending").length

    const getRoleIcon = (role: TeamMember["role"]) => {
        switch (role) {
            case "Owner":
                return <Crown className="h-4 w-4 text-amber-500" />
            case "Admin":
                return <Shield className="h-4 w-4 text-primary" />
            default:
                return <User className="h-4 w-4 text-muted-foreground" />
        }
    }

    const getRoleBadgeStyle = (role: TeamMember["role"]) => {
        switch (role) {
            case "Owner":
                return "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
            case "Admin":
                return "bg-primary/10 text-primary"
            default:
                return ""
        }
    }

    return (
        <div className="space-y-6 animate-in fade-in duration-500">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="space-y-1">
                    <h1 className="text-3xl font-bold tracking-tight">
                        Team Members
                    </h1>
                    <p className="text-muted-foreground">
                        {isAdmin
                            ? "Manage access and roles for your workspace."
                            : "View your workspace team members."}
                    </p>
                </div>
                {isAdmin && (
                    <Button>
                        <UserPlus className="mr-2 h-4 w-4" />
                        Invite Member
                    </Button>
                )}
            </div>

            {/* Stats - Admin only sees pending */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Card>
                    <CardContent className="pt-6">
                        <div className="flex items-center gap-3">
                            <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                                <Users className="h-5 w-5 text-primary" />
                            </div>
                            <div>
                                <p className="text-2xl font-bold">
                                    {mockUsers.length}
                                </p>
                                <p className="text-sm text-muted-foreground">
                                    Total Members
                                </p>
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
                                <p className="text-2xl font-bold">
                                    {activeCount}
                                </p>
                                <p className="text-sm text-muted-foreground">
                                    Active
                                </p>
                            </div>
                        </div>
                    </CardContent>
                </Card>
                {isAdmin && (
                    <>
                        <Card>
                            <CardContent className="pt-6">
                                <div className="flex items-center gap-3">
                                    <div className="h-10 w-10 rounded-lg bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
                                        <Mail className="h-5 w-5 text-amber-600" />
                                    </div>
                                    <div>
                                        <p className="text-2xl font-bold">
                                            {pendingCount}
                                        </p>
                                        <p className="text-sm text-muted-foreground">
                                            Pending Invites
                                        </p>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                        <Card>
                            <CardContent className="pt-6">
                                <div className="flex items-center gap-3">
                                    <div className="h-10 w-10 rounded-lg bg-muted flex items-center justify-center">
                                        <UserPlus className="h-5 w-5 text-muted-foreground" />
                                    </div>
                                    <div>
                                        <p className="text-2xl font-bold">6</p>
                                        <p className="text-sm text-muted-foreground">
                                            Seats Left
                                        </p>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    </>
                )}
            </div>

            {/* User List */}
            <Card>
                <CardHeader>
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        <div>
                            <CardTitle>All Members</CardTitle>
                            <CardDescription>
                                {isAdmin
                                    ? `${activeCount} Active, ${pendingCount} Pending`
                                    : `${activeCount} team members`}
                            </CardDescription>
                        </div>
                        <div className="relative w-full sm:w-64">
                            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                            <Input
                                placeholder="Search members..."
                                className="pl-9"
                            />
                        </div>
                    </div>
                </CardHeader>
                <CardContent className="p-0">
                    <div className="divide-y divide-border">
                        {mockUsers
                            .filter((user) =>
                                isAdmin ? true : user.status === "Active"
                            )
                            .map((user) => (
                                <div
                                    key={user.id}
                                    className="flex items-center justify-between p-4 px-6 hover:bg-muted/50 transition-colors"
                                >
                                    <div className="flex items-center gap-4">
                                        <Avatar className="h-10 w-10">
                                            <AvatarImage
                                                src={
                                                    user.avatar ||
                                                    `https://api.dicebear.com/7.x/initials/svg?seed=${user.name}`
                                                }
                                            />
                                            <AvatarFallback>
                                                {user.name.charAt(0)}
                                            </AvatarFallback>
                                        </Avatar>
                                        <div>
                                            <div className="font-medium">
                                                {user.name}
                                            </div>
                                            {isAdmin ? (
                                                <div className="text-sm text-muted-foreground">
                                                    {user.email}
                                                </div>
                                            ) : (
                                                <div className="text-sm text-muted-foreground flex items-center gap-1">
                                                    {getRoleIcon(user.role)}
                                                    {user.role}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-4">
                                        {isAdmin && (
                                            <Badge
                                                variant={
                                                    user.status === "Active"
                                                        ? "outline"
                                                        : "secondary"
                                                }
                                                className={
                                                    user.status === "Pending"
                                                        ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
                                                        : ""
                                                }
                                            >
                                                {user.status}
                                            </Badge>
                                        )}
                                        <Badge
                                            variant="secondary"
                                            className={getRoleBadgeStyle(
                                                user.role
                                            )}
                                        >
                                            <span className="mr-1">
                                                {getRoleIcon(user.role)}
                                            </span>
                                            {user.role}
                                        </Badge>
                                        {isAdmin && (
                                            <DropdownMenu>
                                                <DropdownMenuTrigger asChild>
                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        className="h-8 w-8"
                                                    >
                                                        <MoreHorizontal className="h-4 w-4 text-muted-foreground" />
                                                    </Button>
                                                </DropdownMenuTrigger>
                                                <DropdownMenuContent align="end">
                                                    {user.status ===
                                                        "Pending" && (
                                                        <DropdownMenuItem>
                                                            <Mail className="mr-2 h-4 w-4" />
                                                            Resend Invite
                                                        </DropdownMenuItem>
                                                    )}
                                                    {user.role !== "Owner" && (
                                                        <>
                                                            <DropdownMenuItem>
                                                                <Shield className="mr-2 h-4 w-4" />
                                                                Change Role
                                                            </DropdownMenuItem>
                                                            <DropdownMenuSeparator />
                                                            <DropdownMenuItem className="text-destructive focus:text-destructive">
                                                                <Trash2 className="mr-2 h-4 w-4" />
                                                                Remove User
                                                            </DropdownMenuItem>
                                                        </>
                                                    )}
                                                    {user.role === "Owner" && (
                                                        <DropdownMenuItem disabled>
                                                            <Crown className="mr-2 h-4 w-4" />
                                                            Workspace Owner
                                                        </DropdownMenuItem>
                                                    )}
                                                </DropdownMenuContent>
                                            </DropdownMenu>
                                        )}
                                    </div>
                                </div>
                            ))}
                    </div>
                </CardContent>
            </Card>
        </div>
    )
}
