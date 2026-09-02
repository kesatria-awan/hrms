import { createFileRoute, Link } from "@tanstack/react-router"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@tracky/web/components/ui/card"
import { Button } from "@tracky/web/components/ui/button"
import { Badge } from "@tracky/web/components/ui/badge"
import { Plus, ArrowRight, MoreVertical, AlertTriangle, CheckSquare, MessageSquare, UserPlus, AlertCircle } from "lucide-react"
import { Avatar, AvatarFallback, AvatarImage } from "@tracky/web/components/ui/avatar"

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
            <section>
                <div className="flex items-center justify-between mb-4">
                    <h2 className="text-xl font-bold">Active Boards</h2>
                    <Button className="bg-[#0f4c3a] hover:bg-[#0f4c3a]/90 text-white shadow-none">
                        <Plus className="mr-2 h-4 w-4" />
                        Create New Board
                    </Button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    {[
                        { title: "Design System Components", total: 12, todo: 4, inProgress: 5, done: 3 },
                        { title: "Documentation Updates", total: 8, todo: 2, inProgress: 3, done: 3 },
                        { title: "Community Feedback", total: 15, todo: 7, inProgress: 6, done: 2 }
                    ].map((board, i) => (
                        <Card key={i} className="hover:shadow-lg transition-all duration-300 cursor-pointer border shadow-sm">
                            <CardHeader className="pb-2">
                                <div className="flex justify-between items-start">
                                    <CardTitle className="text-base font-bold text-foreground">{board.title}</CardTitle>
                                    <Button variant="ghost" size="icon" className="h-6 w-6 -mr-2 text-muted-foreground">
                                        <MoreVertical className="h-4 w-4" />
                                    </Button>
                                </div>
                                <CardDescription>{board.total} tasks total</CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <div className="space-y-2 text-sm font-medium">
                                    <div className="flex justify-between items-center text-muted-foreground">
                                        <span>To Do</span>
                                        <span className="text-foreground">{board.todo}</span>
                                    </div>
                                    <div className="flex justify-between items-center text-muted-foreground">
                                        <span>In Progress</span>
                                        <span className="text-foreground">{board.inProgress}</span>
                                    </div>
                                    <div className="flex justify-between items-center text-muted-foreground">
                                        <span>Done</span>
                                        <span className="text-foreground">{board.done}</span>
                                    </div>
                                </div>

                                <div className="pt-4 flex items-center justify-between border-t border-border/50">
                                    <div className="flex -space-x-2">
                                        {[1, 2, 3].map(avatar => (
                                            <Avatar key={avatar} className="h-6 w-6 border-2 border-background">
                                                <AvatarImage src={`https://github.com/shadcn.png`} />
                                                <AvatarFallback>U</AvatarFallback>
                                            </Avatar>
                                        ))}
                                        {i === 2 && (
                                            <div className="h-6 w-6 rounded-full bg-muted border-2 border-background flex items-center justify-center text-[10px] font-medium text-muted-foreground">
                                                +2
                                            </div>
                                        )}
                                    </div>
                                    <Link to="/boards/$boardId" params={{ boardId: "1" }} className="text-rose-500 p-0 h-auto font-medium hover:text-rose-600 hover:no-underline flex items-center gap-1 group text-sm">
                                        View Board <ArrowRight className="h-3 w-3 transition-transform group-hover:translate-x-1" />
                                    </Link>
                                </div>
                            </CardContent>
                        </Card>
                    ))}
                </div>
            </section>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Overdue Tasks */}
                <section className="lg:col-span-2">
                    <Card className="h-full border shadow-sm">
                        <CardHeader className="pb-4">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2 text-rose-500">
                                    <AlertTriangle className="h-5 w-5 fill-rose-500 text-rose-500" />
                                    <CardTitle className="text-xl font-bold text-foreground">Overdue Tasks</CardTitle>
                                </div>
                                <span className="text-sm text-muted-foreground">5 items</span>
                            </div>
                        </CardHeader>
                        <CardContent>
                            <div className="space-y-3">
                                {[
                                    { title: "Update button component styles", board: "Design System Components", priority: "High", due: "2 days ago", user: "1" },
                                    { title: "Review accessibility guidelines", board: "Documentation Updates", priority: "Medium", due: "1 day ago", user: "2" },
                                    { title: "Fix navigation menu bug", board: "Design System Components", priority: "High", due: "3 days ago", user: "3" },
                                    { title: "Respond to community suggestions", board: "Community Feedback", priority: "Low", due: "1 day ago", user: "4" },
                                    { title: "Update color palette documentation", board: "Documentation Updates", priority: "Medium", due: "4 days ago", user: "5" },
                                ].map((task, i) => (
                                    <div key={i} className="flex items-center justify-between p-4 rounded-xl bg-rose-50/50 hover:bg-rose-50 transition-colors border border-rose-100/50 group">
                                        <div className="flex items-center gap-4">
                                            <div className="h-5 w-5 rounded border border-rose-200 bg-white flex items-center justify-center cursor-pointer hover:border-rose-400 text-transparent">
                                                <CheckSquare className="h-3.5 w-3.5" />
                                            </div>
                                            <div>
                                                <p className="font-semibold text-sm text-foreground group-hover:text-rose-700 transition-colors">{task.title}</p>
                                                <p className="text-xs text-muted-foreground">{task.board}</p>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-4 min-w-[200px] justify-end">
                                            <Badge className={`rounded-full px-3 font-normal ${task.priority === 'High' ? 'bg-rose-500 hover:bg-rose-600' :
                                                task.priority === 'Medium' ? 'bg-pink-500 hover:bg-pink-600' :
                                                    'bg-slate-500 hover:bg-slate-600'
                                                }`}>
                                                {task.priority}
                                            </Badge>
                                            <Avatar className="h-7 w-7 border-2 border-white">
                                                <AvatarImage src={`https://github.com/shadcn.png`} />
                                                <AvatarFallback>U</AvatarFallback>
                                            </Avatar>
                                            <span className="text-xs font-semibold text-rose-500 whitespace-nowrap">{task.due}</span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </CardContent>
                    </Card>
                </section>

                {/* Notifications */}
                <section>
                    <Card className="h-full border shadow-sm">
                        <CardHeader className="pb-4">
                            <CardTitle className="text-xl font-bold">Notifications</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="space-y-4">
                                <NotificationItem
                                    icon={<MessageSquare className="h-4 w-4 text-slate-500" />}
                                    bg="bg-slate-100"
                                    title={<><strong>Sarah M.</strong> commented on your task</>}
                                    time="2 hours ago"
                                    active
                                />
                                <NotificationItem
                                    icon={<UserPlus className="h-4 w-4 text-emerald-600" />}
                                    bg="bg-emerald-50"
                                    title={<><strong>John D.</strong> joined your board</>}
                                    time="5 hours ago"
                                />
                                <NotificationItem
                                    icon={<CheckSquare className="h-4 w-4 text-teal-600" />}
                                    bg="bg-teal-50"
                                    title={<><strong>Emma L.</strong> completed a task</>}
                                    time="1 day ago"
                                />
                                <NotificationItem
                                    icon={<AlertCircle className="h-4 w-4 text-rose-500" />}
                                    bg="bg-rose-50"
                                    title="Task deadline approaching"
                                    time="1 day ago"
                                />
                            </div>
                            <div className="mt-8 text-center">
                                <Button variant="link" className="text-[#0f4c3a] font-semibold hover:text-[#0f4c3a]/80">View All Notifications</Button>
                            </div>
                        </CardContent>
                    </Card>
                </section>
            </div>

            {/* Recent Activity */}
            <section>
                <Card className="border shadow-sm">
                    <CardHeader className="pb-4">
                        <CardTitle className="text-xl font-bold">Recent Activity</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-6">
                            {[
                                { user: "Jessica P.", avatar: "1", action: "created a new task", target: "Design icon set", context: "in Design System Components", time: "15 minutes ago" },
                                { user: "Mike R.", avatar: "2", action: "moved task", target: "Update typography scale", context: "to Done", contextColor: "text-emerald-600", time: "1 hour ago" },
                                { user: "Lisa K.", avatar: "3", action: "uploaded 3 files to", target: "Component Library", time: "3 hours ago" },
                                { user: "Tom S.", avatar: "4", action: "commented on", target: "Review accessibility guidelines", time: "5 hours ago" },
                                { user: "Alex B.", avatar: "5", action: "assigned", target: "Fix navigation menu bug", context: "to Mike R.", time: "8 hours ago" },
                                { user: "Rachel T.", avatar: "6", action: "created board", target: "Q1 Roadmap Planning", time: "1 day ago" },
                            ].map((activity, i) => (
                                <div key={i} className="flex items-start gap-4">
                                    <Avatar className="h-10 w-10 border border-slate-200">
                                        <AvatarImage src={`https://github.com/shadcn.png`} />
                                        <AvatarFallback>U</AvatarFallback>
                                    </Avatar>
                                    <div className="space-y-1">
                                        <p className="text-sm text-foreground">
                                            <span className="font-bold">{activity.user}</span> {activity.action} <span className="font-bold">"{activity.target}"</span> {activity.context && (
                                                <span className={activity.contextColor || "text-[#0f4c3a]"}> {activity.context}</span>
                                            )}
                                        </p>
                                        <p className="text-xs text-muted-foreground">{activity.time}</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </CardContent>
                </Card>
            </section>
        </div>
    )
}

function NotificationItem({ icon, bg, title, time, active }: { icon: React.ReactNode, bg: string, title: React.ReactNode, time: string, active?: boolean }) {
    return (
        <div className={`p-4 rounded-xl flex items-start gap-4 ${active ? 'bg-blue-50/50' : 'bg-transparent border border-muted/40'}`}>
            <div className={`h-8 w-8 rounded-full flex items-center justify-center shrink-0 ${bg}`}>
                {icon}
            </div>
            <div className="space-y-1">
                <p className="text-sm text-foreground">{title}</p>
                <p className="text-xs text-muted-foreground">{time}</p>
            </div>
        </div>
    )
}
