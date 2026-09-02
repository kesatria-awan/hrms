import { createFileRoute, Outlet, Link } from "@tanstack/react-router"
import {
    LayoutDashboard,
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
    DropdownMenuTrigger
} from "@tracky/web/components/ui/dropdown-menu"
import { Avatar, AvatarFallback, AvatarImage } from "@tracky/web/components/ui/avatar"

export const Route = createFileRoute("/_authenticated")({
    component: DashboardLayout,
})

function DashboardLayout() {
    const [sidebarOpen, setSidebarOpen] = useState(true)

    return (
        <div className="flex h-screen w-full bg-background text-foreground overflow-hidden">
            {/* Sidebar */}
            <aside
                className={`bg-sidebar border-r border-sidebar-border transition-all duration-300 flex flex-col ${sidebarOpen ? "w-64" : "w-16 items-center"
                    }`}
            >
                <div className="h-16 flex items-center px-4 border-b border-sidebar-border">
                    <Link to="/dashboard" className="flex items-center gap-2 font-bold text-xl text-sidebar-primary-foreground">
                        <div className="bg-primary text-primary-foreground p-1 rounded-md">
                            <Home className="h-5 w-5" />
                        </div>
                        {sidebarOpen && <span className="text-foreground">Tracky</span>}
                    </Link>
                </div>

                <div className="flex-1 py-4 flex flex-col gap-1 px-3 overflow-y-auto">
                    <NavItem to="/dashboard" icon={<Home />} label="Dashboard" expanded={sidebarOpen} />
                    <NavItem to="/tasks" icon={<CheckSquare />} label="Tasks" expanded={sidebarOpen} />
                    <NavItem to="/boards" icon={<Kanban />} label="Boards" expanded={sidebarOpen} />
                    <NavItem to="/users" icon={<Users />} label="Team" expanded={sidebarOpen} />
                    <NavItem to="/notifications" icon={<Bell />} label="Notifications" expanded={sidebarOpen} />
                    <NavItem to="/files" icon={<FolderOpen />} label="Files" expanded={sidebarOpen} />

                    <Separator className="my-2 bg-sidebar-border" />

                    <NavItem to="/settings" icon={<Settings />} label="Workspace Settings" expanded={sidebarOpen} />
                </div>

                <div className="p-4 border-t border-sidebar-border">
                    <NavItem to="/support" icon={<HelpCircle />} label="Help & Support" expanded={sidebarOpen} />
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
                        <Button variant="ghost" size="icon" className="relative">
                            <Bell className="h-5 w-5 text-muted-foreground" />
                            <span className="absolute top-2 right-2 h-2 w-2 rounded-full bg-destructive" />
                        </Button>

                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button variant="ghost" className="relative h-8 w-8 rounded-full">
                                    <Avatar className="h-8 w-8">
                                        <AvatarImage src="https://github.com/shadcn.png" alt="@shadcn" />
                                        <AvatarFallback>CN</AvatarFallback>
                                    </Avatar>
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent className="w-56" align="end" forceMount>
                                <DropdownMenuLabel className="font-normal">
                                    <div className="flex flex-col space-y-1">
                                        <p className="text-sm font-medium leading-none">Antigravity</p>
                                        <p className="text-xs leading-none text-muted-foreground">
                                            admin@tracky.com
                                        </p>
                                    </div>
                                </DropdownMenuLabel>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem>
                                    Profile
                                </DropdownMenuItem>
                                <DropdownMenuItem>
                                    Settings
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem className="text-destructive focus:text-destructive">
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

function NavItem({ to, icon, label, expanded }: { to: string; icon: React.ReactNode; label: string; expanded: boolean }) {
    return (
        <Link
            to={to}
            activeOptions={{ exact: to === '/dashboard' }}
            className="flex items-center gap-3 px-3 py-2 rounded-md text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors [&.active]:bg-sidebar-primary [&.active]:text-sidebar-primary-foreground group"
        >
            <div className="h-5 w-5 shrink-0 flex items-center justify-center">
                {icon}
            </div>
            {expanded && <span className="text-sm font-medium truncate">{label}</span>}
        </Link>
    )
}
