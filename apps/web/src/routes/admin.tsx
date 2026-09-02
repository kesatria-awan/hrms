import { createFileRoute, Outlet, Link, useNavigate } from "@tanstack/react-router"
import { useAuth } from "@tracky/web/contexts/auth-context"
import { useQuery } from "@tanstack/react-query"
import {
  LayoutDashboard,
  Building2,
  Users,
  ScrollText,
  Settings,
  LogOut,
  Menu,
  Shield,
  Loader2,
  ArrowLeft,
} from "lucide-react"
import { useState } from "react"
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
import { Avatar, AvatarFallback } from "@tracky/web/components/ui/avatar"
import { useApi } from "@tracky/web/hooks/use-api"

export const Route = createFileRoute("/admin")({
  component: AdminLayout,
})

function AdminLayout() {
  const { isAuthenticated, isLoading } = useAuth()
  const navigate = useNavigate()

  if (isLoading) {
    return (
      <div className="h-screen w-full flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!isAuthenticated) {
    navigate({ to: "/login", search: { message: undefined, error: undefined } })
    return null
  }

  return <SuperAdminGuard />
}

function SuperAdminGuard() {
  const api = useApi()
  const navigate = useNavigate()

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

  // Check if user is super admin
  if (!data?.user?.isSuperAdmin) {
    return (
      <div className="h-screen w-full flex items-center justify-center">
        <div className="text-center max-w-md">
          <Shield className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
          <h1 className="text-2xl font-bold mb-2">Access Denied</h1>
          <p className="text-muted-foreground mb-6">
            You don't have permission to access the admin panel.
            This area is restricted to super administrators only.
          </p>
          <Button onClick={() => navigate({ to: "/dashboard" })}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Return to Dashboard
          </Button>
        </div>
      </div>
    )
  }

  return <AdminContent />
}

function AdminContent() {
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const { user, logout } = useAuth()

  const userInitials = user?.email?.[0]?.toUpperCase() || "U"

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
            to="/admin"
            className="flex items-center gap-2 font-bold text-xl text-sidebar-primary-foreground"
          >
            <div className="bg-destructive text-destructive-foreground p-1 rounded-md">
              <Shield className="h-5 w-5" />
            </div>
            {sidebarOpen && <span className="text-foreground">Admin Panel</span>}
          </Link>
        </div>

        <div className="flex-1 py-4 flex flex-col gap-1 px-3 overflow-y-auto">
          <NavItem to="/admin" icon={<LayoutDashboard />} label="Dashboard" expanded={sidebarOpen} exact />
          <NavItem to="/admin/workspaces" icon={<Building2 />} label="Workspaces" expanded={sidebarOpen} />
          <NavItem to="/admin/users" icon={<Users />} label="Users" expanded={sidebarOpen} />
          <NavItem to="/admin/audit-logs" icon={<ScrollText />} label="Audit Logs" expanded={sidebarOpen} />

          <Separator className="my-2 bg-sidebar-border" />

          <Link
            to="/dashboard"
            className="flex items-center gap-3 px-3 py-2 rounded-md text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors"
          >
            <div className="h-5 w-5 shrink-0 flex items-center justify-center">
              <ArrowLeft className="h-4 w-4" />
            </div>
            {sidebarOpen && <span className="text-sm font-medium truncate">Back to App</span>}
          </Link>
        </div>

        <div className="p-4 border-t border-sidebar-border">
          <NavItem to="/admin/settings" icon={<Settings />} label="Admin Settings" expanded={sidebarOpen} />
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col h-full overflow-hidden">
        {/* Header */}
        <header className="h-16 border-b border-border bg-background flex items-center justify-between px-6 shrink-0">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => setSidebarOpen(!sidebarOpen)}>
              <Menu className="h-5 w-5" />
            </Button>
            <div className="flex items-center gap-2">
              <Shield className="h-4 w-4 text-destructive" />
              <span className="text-sm font-medium text-muted-foreground">Super Admin Mode</span>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="relative h-8 w-8 rounded-full">
                  <Avatar className="h-8 w-8">
                    <AvatarFallback>{userInitials}</AvatarFallback>
                  </Avatar>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="w-56" align="end" forceMount>
                <DropdownMenuLabel className="font-normal">
                  <div className="flex flex-col space-y-1">
                    <p className="text-sm font-medium leading-none">
                      {user?.email || "User"}
                    </p>
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link to="/dashboard">Back to App</Link>
                </DropdownMenuItem>
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
  exact = false,
}: {
  to: string
  icon: React.ReactNode
  label: string
  expanded: boolean
  exact?: boolean
}) {
  return (
    <Link
      to={to}
      activeOptions={{ exact }}
      className="flex items-center gap-3 px-3 py-2 rounded-md text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors [&.active]:bg-sidebar-primary [&.active]:text-sidebar-primary-foreground group"
    >
      <div className="h-5 w-5 shrink-0 flex items-center justify-center">{icon}</div>
      {expanded && <span className="text-sm font-medium truncate">{label}</span>}
    </Link>
  )
}
