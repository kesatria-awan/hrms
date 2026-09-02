import { createFileRoute, Outlet, Link, useNavigate, useLocation } from "@tanstack/react-router"
import { useQuery } from "@tanstack/react-query"
import {
  Kanban,
  CheckSquare,
  Users,
  Settings,
  HelpCircle,
  Bell,
  Search,
  LogOut,
  Menu,
  Home,
  FolderOpen,
  Loader2,
  Megaphone,
} from "lucide-react"
import { TrackyLogo } from "@tracky/web/components/tracky-logo"
import { NotificationPopover } from "@tracky/web/components/notifications/notification-popover"
import { WorkspaceSwitcher } from "@tracky/web/components/workspace-switcher"
import { useState, useEffect } from "react"
import { Button } from "@tracky/web/components/ui/button"
import { Separator } from "@tracky/web/components/ui/separator"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@tracky/web/components/ui/dropdown-menu"
import { Avatar, AvatarFallback, AvatarImage } from "@tracky/web/components/ui/avatar"
import { useApi } from "@tracky/web/hooks/use-api"
import { AnnouncementBanner } from "@tracky/web/components/announcement-banner"
import { useAuth } from "@tracky/web/contexts/auth-context"

export const Route = createFileRoute("/_authenticated")({
  component: DashboardLayout,
})

function DashboardLayout() {
  const { isAuthenticated, isVerified, isLoading } = useAuth()
  const navigate = useNavigate()

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      navigate({ to: "/login", search: { message: undefined, error: undefined } })
    }
  }, [isAuthenticated, isLoading, navigate])

  useEffect(() => {
    if (!isLoading && isAuthenticated && !isVerified) {
      navigate({ to: "/verify-email", search: { token: undefined } })
    }
  }, [isAuthenticated, isVerified, isLoading, navigate])

  // UI-SPEC: centered Loader2 spinner during hydration
  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!isAuthenticated || !isVerified) return null // redirect in-flight

  return <WorkspaceGuard />
}

function WorkspaceGuard() {
  const api = useApi()
  const navigate = useNavigate()
  const location = useLocation()

  const { data, isLoading, error } = useQuery({
    queryKey: ["auth", "me"],
    queryFn: async () => {
      const response = await api.auth.me.$get()
      if (!response.ok) {
        throw new Error("Failed to fetch user")
      }
      return response.json()
    },
    retry: false,
  })

  // Redirect to onboarding if user has no workspace
  useEffect(() => {
    if (data && !data.workspace) {
      navigate({ to: "/onboarding" })
    }
  }, [data, navigate])

  // Role-based redirect - members cannot access admin-only pages
  useEffect(() => {
    if (!data?.user || !data?.workspace) return

    const currentPath = location.pathname
    const userRole = data.user.role

    const adminOnlyPaths = ["/dashboard", "/files", "/support"] // /settings removed — all users access profile tab
    if (userRole === "member" && adminOnlyPaths.some(p => currentPath === p)) {
      navigate({ to: "/tasks" })
    }
  }, [data, location.pathname, navigate])

  if (isLoading) {
    return (
      <div className="h-screen w-full flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="h-screen w-full flex items-center justify-center">
        <div className="text-center">
          <p className="text-destructive mb-4">Failed to load user data</p>
          <Button onClick={() => window.location.reload()}>Retry</Button>
        </div>
      </div>
    )
  }

  // Still waiting for redirect or user has workspace
  if (!data?.workspace) {
    return (
      <div className="h-screen w-full flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <AuthenticatedContent
      userRole={data.user?.role ?? "member"}
      userData={{
        firstName: data.user?.firstName ?? null,
        lastName: data.user?.lastName ?? null,
        email: data.user?.email ?? "",
        avatarUrl: data.user?.avatarUrl ?? null,
        imageUrl: data.user?.imageUrl ?? null,
      }}
    />
  )
}

interface UserData {
  firstName: string | null
  lastName: string | null
  email: string
  avatarUrl: string | null
  imageUrl: string | null
}

function AuthenticatedContent({ userRole, userData }: { userRole: string; userData: UserData }) {
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const { logout } = useAuth()
  const isAdmin = userRole === "workspace_admin" || userRole === "super_admin"

  const userInitials = userData.firstName && userData.lastName
    ? `${userData.firstName[0]}${userData.lastName[0]}`
    : userData.email?.[0]?.toUpperCase() || "U"

  const avatarSrc = userData.avatarUrl ?? userData.imageUrl ?? undefined

  return (
    <div className="flex h-screen w-full bg-background text-foreground overflow-hidden">
      {/* Sidebar */}
      <aside
        className={`bg-sidebar border-r border-sidebar-border transition-all duration-300 flex flex-col ${
          sidebarOpen ? "w-64" : "w-16 items-center"
        }`}
      >
        <div className="h-16 flex items-center px-4 border-b border-sidebar-border">
          <Link
            to={isAdmin ? "/dashboard" : "/tasks"}
            className="flex items-center gap-2 font-bold text-xl text-sidebar-primary-foreground"
          >
            <div className="bg-primary text-primary-foreground p-1 rounded-md">
              <TrackyLogo className="h-5 w-5" />
            </div>
            {sidebarOpen && <span className="text-foreground">Tracky Pro</span>}
          </Link>
        </div>

        {/* Workspace Switcher */}
        <div className="px-3 py-3 border-b border-sidebar-border">
          <WorkspaceSwitcher expanded={sidebarOpen} />
        </div>

        <div className="flex-1 py-4 flex flex-col gap-1 px-3 overflow-y-auto">
          {isAdmin && <NavItem to="/dashboard" icon={<Home />} label="Dashboard" expanded={sidebarOpen} />}
          <NavItem to="/tasks" icon={<CheckSquare />} label="Tasks" expanded={sidebarOpen} />
          <NavItem to="/boards" icon={<Kanban />} label="Boards" expanded={sidebarOpen} />
          {isAdmin && <NavItem to="/users" icon={<Users />} label="Team" expanded={sidebarOpen} />}
          <NavItem to="/notifications" icon={<Bell />} label="Notifications" expanded={sidebarOpen} />
          <NavItem to="/announcements" icon={<Megaphone />} label="Announcements" expanded={sidebarOpen} />
          {isAdmin && <NavItem to="/files" icon={<FolderOpen />} label="Files" expanded={sidebarOpen} />}

          <Separator className="my-2 bg-sidebar-border" />
          <NavItem to="/settings" icon={<Settings />} label={isAdmin ? "Settings" : "Profile"} expanded={sidebarOpen} />
        </div>

        {isAdmin && (
          <div className="p-4 border-t border-sidebar-border">
            <NavItem to="/support" icon={<HelpCircle />} label="Help & Support" expanded={sidebarOpen} />
          </div>
        )}
      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col h-full overflow-hidden">
        {/* Header */}
        <header className="h-16 border-b border-border bg-background flex items-center justify-between px-6 shrink-0">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => setSidebarOpen(!sidebarOpen)}>
              <Menu className="h-5 w-5" />
            </Button>
            <div className="relative w-64 hidden md:block">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search tasks, boards..."
                className="w-full h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring pl-9"
              />
            </div>
          </div>

          <div className="flex items-center gap-4">
            <NotificationPopover />

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="relative h-8 w-8 rounded-full">
                  <Avatar className="h-8 w-8">
                    <AvatarImage src={avatarSrc} alt={userData.firstName ?? "User"} />
                    <AvatarFallback>{userInitials}</AvatarFallback>
                  </Avatar>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="w-56" align="end" forceMount>
                <DropdownMenuLabel className="font-normal">
                  <div className="flex flex-col space-y-1">
                    <p className="text-sm font-medium leading-none">
                      {userData.firstName && userData.lastName
                        ? `${userData.firstName} ${userData.lastName}`
                        : userData.email || "User"}
                    </p>
                    <p className="text-xs leading-none text-muted-foreground">
                      {userData.email}
                    </p>
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild><Link to="/settings" search={{ billing: undefined }}>Profile</Link></DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="text-destructive focus:text-destructive"
                  onClick={() => logout()}
                >
                  <LogOut className="mr-2 h-4 w-4" />
                  Log out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        <AnnouncementBanner />

        {/* Page Content */}
        <main className="flex-1 overflow-y-auto bg-muted/20 p-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}

function NavItem({
  to,
  icon,
  label,
  expanded,
}: {
  to: string
  icon: React.ReactNode
  label: string
  expanded: boolean
}) {
  return (
    <Link
      to={to}
      activeOptions={{ exact: to === "/dashboard" }}
      className="flex items-center gap-3 px-3 py-2 rounded-md text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors [&.active]:bg-sidebar-primary [&.active]:text-sidebar-primary-foreground group"
    >
      <div className="h-5 w-5 shrink-0 flex items-center justify-center">{icon}</div>
      {expanded && <span className="text-sm font-medium truncate">{label}</span>}
    </Link>
  )
}
