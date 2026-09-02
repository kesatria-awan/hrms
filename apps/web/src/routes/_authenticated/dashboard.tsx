import { createFileRoute, Link } from "@tanstack/react-router"
import { useRef, useState, useEffect } from "react"
import { useQuery } from "@tanstack/react-query"
import { formatDistanceToNow } from "date-fns"
import { Card, CardContent, CardHeader, CardTitle } from "@tracky/web/components/ui/card"
import { Button } from "@tracky/web/components/ui/button"
import { Badge } from "@tracky/web/components/ui/badge"
import { Input } from "@tracky/web/components/ui/input"
import { Textarea } from "@tracky/web/components/ui/textarea"
import { Plus, AlertTriangle, CheckSquare, ChevronLeft, ChevronRight, Loader2, Calendar, Clock, CircleDot, CircleCheck, CircleAlert, Megaphone } from "lucide-react"
import { Avatar, AvatarFallback, AvatarImage } from "@tracky/web/components/ui/avatar"
import { useApi } from "@tracky/web/hooks/use-api"
import { useOverdueTasks, type TaskWithBoard } from "@tracky/web/hooks/use-tasks"
import { useAnnouncements, useCreateAnnouncement } from "@tracky/web/hooks/use-announcements"
import { useWorkspaceActivities, type ActivityAction } from "@tracky/web/hooks/use-activities"

export const Route = createFileRoute("/_authenticated/dashboard")({
    component: DashboardOverview,
})

function DashboardOverview() {
    return (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Overview</h1>
                    <p className="text-muted-foreground mt-1">Welcome back, here's what's happening in your workspace.</p>
                </div>

            </div>

            {/* Active Boards Summary */}
            <ActiveBoardsSlider />

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Overdue Tasks */}
                <OverdueTasksSection />

                {/* Announcements */}
                <AnnouncementsSection />
            </div>

            {/* Recent Activity */}
            <RecentActivitySection />
        </div>
    )
}

const ACTION_LABELS: Record<ActivityAction, string> = {
    task_created: "created task",
    task_moved: "moved task",
    task_updated: "updated task",
    task_archived: "archived task",
    task_unarchived: "unarchived task",
    task_deleted: "deleted task",
    assignee_added: "assigned",
    assignee_removed: "unassigned",
    comment_added: "commented on",
    comment_deleted: "deleted comment on",
    attachment_uploaded: "uploaded attachment to",
    attachment_deleted: "deleted attachment from",
}

function RecentActivitySection() {
    const { data: activities, isLoading } = useWorkspaceActivities({ limit: 10 })

    const getUserName = (user: { firstName: string | null; lastName: string | null; email: string }) => {
        const name = [user.firstName, user.lastName].filter(Boolean).join(" ")
        return name || user.email
    }

    const getInitials = (user: { firstName: string | null; lastName: string | null; email: string }) => {
        if (user.firstName && user.lastName) return `${user.firstName[0]}${user.lastName[0]}`.toUpperCase()
        if (user.firstName) return user.firstName[0].toUpperCase()
        return user.email[0]?.toUpperCase() || "?"
    }

    return (
        <section>
            <Card className="border shadow-sm">
                <CardHeader className="pb-4">
                    <CardTitle className="text-xl font-bold">Recent Activity</CardTitle>
                </CardHeader>
                <CardContent>
                    {isLoading ? (
                        <div className="flex items-center justify-center py-8">
                            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                        </div>
                    ) : activities && activities.length > 0 ? (
                        <div className="space-y-6">
                            {activities.map((activity) => (
                                <div key={activity.id} className="flex items-start gap-4">
                                    <Avatar className="h-10 w-10 border border-slate-200">
                                        <AvatarImage src={activity.user.imageUrl || undefined} />
                                        <AvatarFallback>{getInitials(activity.user)}</AvatarFallback>
                                    </Avatar>
                                    <div className="space-y-1">
                                        <p className="text-sm text-foreground">
                                            <span className="font-bold">{getUserName(activity.user)}</span>{" "}
                                            {ACTION_LABELS[activity.action as ActivityAction] || activity.action}{" "}
                                            {activity.taskTitle && <span className="font-bold">"{activity.taskTitle}"</span>}
                                            {activity.boardName && (
                                                <span className="text-[#0f4c3a]"> in {activity.boardName}</span>
                                            )}
                                        </p>
                                        <p className="text-xs text-muted-foreground">
                                            {formatDistanceToNow(new Date(activity.createdAt), { addSuffix: true })}
                                        </p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="flex flex-col items-center justify-center py-8 text-center">
                            <Clock className="h-8 w-8 text-muted-foreground/50 mb-2" />
                            <p className="text-sm text-muted-foreground">No recent activity</p>
                        </div>
                    )}
                </CardContent>
            </Card>
        </section>
    )
}

function ActiveBoardsSlider() {
    const api = useApi()
    const scrollContainerRef = useRef<HTMLDivElement>(null)
    const [canScrollLeft, setCanScrollLeft] = useState(false)
    const [canScrollRight, setCanScrollRight] = useState(false)

    // Fetch boards from API
    const { data: boards, isLoading } = useQuery({
        queryKey: ["boards"],
        queryFn: async () => {
            const response = await api.boards.$get()
            if (!response.ok) {
                throw new Error("Failed to fetch boards")
            }
            return response.json()
        },
    })

    const checkScrollability = () => {
        const container = scrollContainerRef.current
        if (container) {
            setCanScrollLeft(container.scrollLeft > 0)
            setCanScrollRight(
                container.scrollLeft < container.scrollWidth - container.clientWidth - 1
            )
        }
    }

    useEffect(() => {
        checkScrollability()
        const container = scrollContainerRef.current
        if (container) {
            container.addEventListener("scroll", checkScrollability)
            window.addEventListener("resize", checkScrollability)
            return () => {
                container.removeEventListener("scroll", checkScrollability)
                window.removeEventListener("resize", checkScrollability)
            }
        }
    }, [boards])

    const scroll = (direction: "left" | "right") => {
        const container = scrollContainerRef.current
        if (container) {
            const cardWidth = 404 // card width (380px) + gap (24px)
            const scrollAmount = direction === "left" ? -cardWidth : cardWidth
            container.scrollBy({ left: scrollAmount, behavior: "smooth" })
        }
    }

    return (
        <section>
            <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-bold">Active Boards</h2>
                <div className="flex items-center gap-2">
                    {boards && boards.length > 3 && (
                        <div className="flex items-center gap-1 mr-2">
                            <Button
                                variant="outline"
                                size="icon"
                                className="h-8 w-8 rounded-full"
                                onClick={() => scroll("left")}
                                disabled={!canScrollLeft}
                            >
                                <ChevronLeft className="h-4 w-4" />
                            </Button>
                            <Button
                                variant="outline"
                                size="icon"
                                className="h-8 w-8 rounded-full"
                                onClick={() => scroll("right")}
                                disabled={!canScrollRight}
                            >
                                <ChevronRight className="h-4 w-4" />
                            </Button>
                        </div>
                    )}
                    <Link to="/boards">
                        <Button className="bg-[#0f4c3a] hover:bg-[#0f4c3a]/90 text-white shadow-none">
                            <Plus className="mr-2 h-4 w-4" />
                            Create New Board
                        </Button>
                    </Link>
                </div>
            </div>

            {isLoading ? (
                <div className="flex items-center justify-center h-48">
                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
            ) : boards && boards.length > 0 ? (
                <div
                    ref={scrollContainerRef}
                    className="flex gap-6 overflow-x-auto scrollbar-hide pb-2 -mx-1 px-1"
                    style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
                >
                    {boards.map((board) => (
                        <Link
                            key={board.id}
                            to="/boards/$boardId"
                            params={{ boardId: board.id }}
                            className="block flex-shrink-0 w-[380px]"
                        >
                            <Card className="h-full hover:shadow-lg transition-all duration-300 cursor-pointer border shadow-sm pt-0 overflow-hidden group">
                                {/* Color bar at top */}
                                <div
                                    className="h-1.5 w-full"
                                    style={{ backgroundColor: board.color }}
                                />
                                <CardContent className="p-5">
                                    <div className="flex gap-5">
                                        {/* Left column: title, description, users */}
                                        <div className="flex flex-col justify-between min-w-0 flex-1">
                                            <div>
                                                <h3 className="font-bold text-base text-foreground truncate">{board.name}</h3>
                                                <p className="text-sm text-muted-foreground line-clamp-2 mt-1">
                                                    {board.description || "No description"}
                                                </p>
                                            </div>
                                            <div className="mt-4">
                                                <BoardMemberAvatars boardId={board.id} />
                                            </div>
                                        </div>

                                        {/* Divider */}
                                        <div className="w-px bg-border/60 self-stretch" />

                                        {/* Right column: task stats */}
                                        <BoardTaskStats boardId={board.id} />
                                    </div>
                                </CardContent>
                            </Card>
                        </Link>
                    ))}
                </div>
            ) : (
                <Card className="p-8 text-center">
                    <p className="text-muted-foreground mb-4">No boards yet. Create your first board to get started.</p>
                    <Link to="/boards">
                        <Button className="bg-[#0f4c3a] hover:bg-[#0f4c3a]/90 text-white shadow-none">
                            <Plus className="mr-2 h-4 w-4" />
                            Create New Board
                        </Button>
                    </Link>
                </Card>
            )}
        </section>
    )
}

function OverdueTasksSection() {
    const { data: overdueTasks, isLoading, error } = useOverdueTasks(10)

    const getInitials = (task: TaskWithBoard) => {
        const assignee = task.assignees[0]
        if (!assignee) return "?"
        const { firstName, lastName, email } = assignee.user
        if (firstName && lastName) return `${firstName[0]}${lastName[0]}`.toUpperCase()
        if (firstName) return firstName[0].toUpperCase()
        return email?.[0]?.toUpperCase() || "?"
    }

    const formatDueDate = (dueDate: string) => {
        return formatDistanceToNow(new Date(dueDate), { addSuffix: true })
    }

    const getPriorityColor = (priority: string) => {
        switch (priority) {
            case "high":
                return "bg-rose-500 hover:bg-rose-600"
            case "medium":
                return "bg-pink-500 hover:bg-pink-600"
            default:
                return "bg-slate-500 hover:bg-slate-600"
        }
    }

    return (
        <section className="lg:col-span-2">
            <Card className="h-full border shadow-sm">
                <CardHeader className="pb-4">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 text-rose-500">
                            <AlertTriangle className="h-5 w-5 fill-rose-500 text-rose-500" />
                            <CardTitle className="text-xl font-bold text-foreground">Overdue Tasks</CardTitle>
                        </div>
                        <span className="text-sm text-muted-foreground">
                            {overdueTasks?.length || 0} items
                        </span>
                    </div>
                </CardHeader>
                <CardContent>
                    {isLoading ? (
                        <div className="flex items-center justify-center py-8">
                            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                        </div>
                    ) : error ? (
                        <div className="text-center py-8 text-sm text-destructive">
                            Failed to load overdue tasks.
                        </div>
                    ) : overdueTasks && overdueTasks.length > 0 ? (
                        <div className="space-y-3">
                            {overdueTasks.map((task) => (
                                <Link
                                    key={task.id}
                                    to="/boards/$boardId"
                                    params={{ boardId: task.boardId }}
                                    className="block"
                                >
                                    <div className="flex items-center justify-between p-4 rounded-xl bg-rose-50/50 hover:bg-rose-50 transition-colors border border-rose-100/50 group">
                                        <div className="flex items-center gap-4">
                                            <div className="h-5 w-5 rounded border border-rose-200 bg-white flex items-center justify-center cursor-pointer hover:border-rose-400 text-transparent">
                                                <CheckSquare className="h-3.5 w-3.5" />
                                            </div>
                                            <div>
                                                <p className="font-semibold text-sm text-foreground group-hover:text-rose-700 transition-colors">{task.title}</p>
                                                <p className="text-xs text-muted-foreground">{task.boardName}</p>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-4 min-w-[200px] justify-end">
                                            <Badge className={`rounded-full px-3 font-normal capitalize ${getPriorityColor(task.priority)}`}>
                                                {task.priority}
                                            </Badge>
                                            {task.assignees.length > 0 ? (
                                                <Avatar className="h-7 w-7 border-2 border-white">
                                                    <AvatarImage src={task.assignees[0].user.imageUrl || undefined} />
                                                    <AvatarFallback>{getInitials(task)}</AvatarFallback>
                                                </Avatar>
                                            ) : (
                                                <div className="h-7 w-7 rounded-full bg-muted border-2 border-white flex items-center justify-center text-xs text-muted-foreground">
                                                    ?
                                                </div>
                                            )}
                                            <span className="text-xs font-semibold text-rose-500 whitespace-nowrap">
                                                {task.dueDate && formatDueDate(task.dueDate)}
                                            </span>
                                        </div>
                                    </div>
                                </Link>
                            ))}
                        </div>
                    ) : (
                        <div className="flex flex-col items-center justify-center py-8 text-center">
                            <Calendar className="h-8 w-8 text-muted-foreground/50 mb-2" />
                            <p className="text-sm text-muted-foreground">No overdue tasks</p>
                            <p className="text-xs text-muted-foreground mt-1">You're all caught up!</p>
                        </div>
                    )}
                </CardContent>
            </Card>
        </section>
    )
}

function BoardTaskStats({ boardId }: { boardId: string }) {
    const api = useApi()

    const { data: board } = useQuery({
        queryKey: ["board", boardId],
        queryFn: async () => {
            const response = await api.boards[":id"].$get({ param: { id: boardId } })
            if (!response.ok) throw new Error("Failed to fetch board")
            return response.json()
        },
    })

    const { data: tasks } = useQuery({
        queryKey: ["tasks", boardId],
        queryFn: async () => {
            const response = await api.tasks.$get({ query: { boardId } })
            if (!response.ok) throw new Error("Failed to fetch tasks")
            return response.json()
        },
    })

    const doneColumnIds = new Set(
        board?.columns?.filter((c) => c.isDoneColumn).map((c) => c.id) ?? []
    )

    const now = new Date()
    const threeDaysFromNow = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000)

    const completed = tasks?.filter((t) => doneColumnIds.has(t.columnId)).length ?? 0
    const activeTasks = tasks?.filter((t) => !doneColumnIds.has(t.columnId)) ?? []
    const overdue = activeTasks.filter((t) => t.dueDate && new Date(t.dueDate) < now).length
    const dueSoon = activeTasks.filter(
        (t) => t.dueDate && new Date(t.dueDate) >= now && new Date(t.dueDate) <= threeDaysFromNow
    ).length
    const active = activeTasks.length

    const stats = [
        { label: "Due Soon", value: dueSoon, icon: Clock, color: "text-amber-500" },
        { label: "Active", value: active, icon: CircleDot, color: "text-blue-500" },
        { label: "Overdue", value: overdue, icon: CircleAlert, color: "text-rose-500" },
        { label: "Completed", value: completed, icon: CircleCheck, color: "text-emerald-500" },
    ]

    return (
        <div className="flex flex-col justify-center gap-2.5 min-w-[140px]">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Tasks</span>
            {stats.map((stat) => (
                <div key={stat.label} className="flex items-center justify-between text-sm">
                    <span className="flex items-center gap-1.5 text-muted-foreground">
                        <stat.icon className={`h-3.5 w-3.5 ${stat.color}`} />
                        {stat.label}
                    </span>
                    <span className="font-semibold text-foreground tabular-nums">{stat.value}</span>
                </div>
            ))}
        </div>
    )
}

const MAX_VISIBLE_AVATARS = 3

function BoardMemberAvatars({ boardId }: { boardId: string }) {
    const api = useApi()
    const { data } = useQuery({
        queryKey: ["board-members", boardId],
        queryFn: async () => {
            const response = await api.boards[":id"].members.$get({
                param: { id: boardId },
            })
            if (!response.ok) {
                throw new Error("Failed to fetch board members")
            }
            return response.json()
        },
    })

    const members = data?.members ?? []
    const visible = members.slice(0, MAX_VISIBLE_AVATARS)
    const overflow = members.length - MAX_VISIBLE_AVATARS

    const getInitials = (member: typeof members[number]) => {
        const { firstName, lastName, email } = member.user
        if (firstName && lastName) return `${firstName[0]}${lastName[0]}`.toUpperCase()
        if (firstName) return firstName[0].toUpperCase()
        return email?.[0]?.toUpperCase() || "?"
    }

    return (
        <div className="flex -space-x-2">
            {visible.map((member) => (
                <Avatar key={member.id} className="h-6 w-6 border-2 border-background">
                    <AvatarImage src={member.user.imageUrl || undefined} />
                    <AvatarFallback className="text-[10px]">{getInitials(member)}</AvatarFallback>
                </Avatar>
            ))}
            {overflow > 0 && (
                <div className="h-6 w-6 rounded-full bg-muted border-2 border-background flex items-center justify-center text-[10px] font-medium text-muted-foreground">
                    +{overflow}
                </div>
            )}
        </div>
    )
}

function AnnouncementsSection() {
    const { data: announcements, isLoading } = useAnnouncements()
    const createAnnouncement = useCreateAnnouncement()
    const api = useApi()
    const { data: meData } = useQuery({
        queryKey: ["auth", "me"],
        queryFn: async () => {
            const response = await api.auth.me.$get()
            if (!response.ok) throw new Error("Failed to fetch user")
            return response.json()
        },
    })
    const workspaceRole = meData?.user?.role
    const isAdmin = workspaceRole === "workspace_admin"
    const [showForm, setShowForm] = useState(false)
    const [title, setTitle] = useState("")
    const [body, setBody] = useState("")

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault()
        if (!title.trim()) return
        createAnnouncement.mutate(
            { title: title.trim(), body: body.trim() || undefined },
            {
                onSuccess: () => {
                    setTitle("")
                    setBody("")
                    setShowForm(false)
                },
            },
        )
    }

    const getInitials = (firstName: string | null, lastName: string | null, email: string) => {
        if (firstName && lastName) return `${firstName[0]}${lastName[0]}`.toUpperCase()
        if (firstName) return firstName[0].toUpperCase()
        return email[0]?.toUpperCase() || "?"
    }

    return (
        <section>
            <Card className="h-full border shadow-sm">
                <CardHeader className="pb-4">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <Megaphone className="h-5 w-5 text-[#0f4c3a]" />
                            <CardTitle className="text-xl font-bold">Announcements</CardTitle>
                        </div>
                        <div className="flex items-center gap-2">
                            <Link to="/announcements" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
                                View all
                            </Link>
                        {isAdmin && !showForm && (
                            <Button
                                size="sm"
                                variant="outline"
                                onClick={() => setShowForm(true)}
                            >
                                <Plus className="mr-1 h-3.5 w-3.5" />
                                New
                            </Button>
                        )}
                        </div>
                    </div>
                </CardHeader>
                <CardContent>
                    {showForm && (
                        <form onSubmit={handleSubmit} className="mb-4 space-y-3 p-3 rounded-lg border bg-muted/30">
                            <Input
                                placeholder="Title"
                                value={title}
                                onChange={e => setTitle(e.target.value)}
                                required
                            />
                            <Textarea
                                placeholder="Body (optional)"
                                value={body}
                                onChange={e => setBody(e.target.value)}
                                rows={2}
                            />
                            <div className="flex gap-2 justify-end">
                                <Button type="button" variant="ghost" size="sm" onClick={() => setShowForm(false)}>
                                    Cancel
                                </Button>
                                <Button type="submit" size="sm" className="bg-[#0f4c3a] hover:bg-[#0f4c3a]/90 text-white" disabled={createAnnouncement.isPending}>
                                    {createAnnouncement.isPending ? "Posting..." : "Post"}
                                </Button>
                            </div>
                        </form>
                    )}
                    {isLoading ? (
                        <div className="flex items-center justify-center py-8">
                            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                        </div>
                    ) : announcements && announcements.length > 0 ? (
                        <div className="space-y-4">
                            {announcements.map((a) => (
                                <div key={a.id} className="p-4 rounded-xl bg-muted/30 border border-muted/40">
                                    <div className="flex items-start gap-3">
                                        <Avatar className="h-8 w-8 border border-slate-200">
                                            <AvatarImage src={a.author.imageUrl || undefined} />
                                            <AvatarFallback className="text-xs">
                                                {getInitials(a.author.firstName, a.author.lastName, a.author.email)}
                                            </AvatarFallback>
                                        </Avatar>
                                        <div className="min-w-0 flex-1">
                                            <div className="flex items-center gap-2">
                                                <span className="text-sm font-semibold">
                                                    {[a.author.firstName, a.author.lastName].filter(Boolean).join(" ") || a.author.email}
                                                </span>
                                                <span className="text-xs text-muted-foreground">
                                                    {formatDistanceToNow(new Date(a.createdAt), { addSuffix: true })}
                                                </span>
                                            </div>
                                            <p className="text-sm font-medium mt-1">{a.title}</p>
                                            {a.body && (
                                                <p className="text-sm text-muted-foreground mt-0.5 line-clamp-2">{a.body}</p>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="flex flex-col items-center justify-center py-8 text-center">
                            <Megaphone className="h-8 w-8 text-muted-foreground/50 mb-2" />
                            <p className="text-sm text-muted-foreground">No announcements yet</p>
                        </div>
                    )}
                </CardContent>
            </Card>
        </section>
    )
}
