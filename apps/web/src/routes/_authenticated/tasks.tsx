import { createFileRoute } from "@tanstack/react-router"
import { Button } from "@tracky/web/components/ui/button"
import { Badge } from "@tracky/web/components/ui/badge"
import { Input } from "@tracky/web/components/ui/input"
import { Avatar, AvatarFallback, AvatarImage } from "@tracky/web/components/ui/avatar"
import {
    Search, Plus, SlidersHorizontal, X,
    Calendar, Flag, Paperclip, MessageSquare, User, MoreHorizontal,
    MoreVertical
} from "lucide-react"
import { useState } from "react"

export const Route = createFileRoute("/_authenticated/tasks")({
    component: TasksPage,
})

// Mock Data
const tasks = [
    { id: 1, title: "Update invoice template design", board: "Finance", status: "In Progress", due: "Jan 17, 2026", priority: "High", assignee: 1 },
    { id: 2, title: "Fix login authentication bug", board: "Platform", status: "To Do", due: "Jan 18, 2026", priority: "Medium", assignee: 2 },
    { id: 3, title: "Review Q1 sales proposal", board: "Sales", status: "To Do", due: "Jan 19, 2026", priority: "High", assignee: 1 },
    { id: 4, title: "Prepare onboarding materials", board: "HR", status: "In Progress", due: "Jan 22, 2026", priority: "Low", assignee: 4 },
    { id: 5, title: "Update API documentation", board: "Platform", status: "To Do", due: "Jan 25, 2026", priority: "Medium", assignee: 2 },
    { id: 6, title: "Design new landing page mockup", board: "Marketing", status: "In Progress", due: "Jan 20, 2026", priority: "Medium", assignee: 3 },
    { id: 7, title: "Schedule team retrospective meeting", board: "HR", status: "To Do", due: "Jan 23, 2026", priority: "Low", assignee: 4 },
    { id: 8, title: "Conduct user research interviews", board: "Marketing", status: "To Do", due: "Jan 28, 2026", priority: "Low", assignee: 3 },
]

function TasksPage() {
    const [activeTab, setActiveTab] = useState("assigned-me")
    const [selectedTaskId, setSelectedTaskId] = useState<number | null>(null)

    const tabs = [
        { id: "assigned-me", label: "Assigned to Me" },
        { id: "due-soon", label: "Due Soon" },
        { id: "overdue", label: "Overdue" },
        { id: "all", label: "All Tasks" },
        { id: "completed", label: "Completed" },
    ]

    return (
        <div className="h-full flex flex-col animate-in fade-in duration-500 -m-6">
            {/* Header section */}
            <div className="bg-background border-b border-border px-8 py-4 shrink-0 space-y-4">
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-2xl font-bold tracking-tight">Tasks</h1>
                    </div>
                    <Button className="bg-primary hover:bg-primary/90 text-primary-foreground shadow-sm">
                        <Plus className="mr-2 h-4 w-4" />
                        Create Task
                    </Button>
                </div>

                <div className="flex items-center gap-6 border-b border-transparent">
                    {tabs.map(tab => (
                        <TabButton
                            key={tab.id}
                            active={activeTab === tab.id}
                            onClick={() => setActiveTab(tab.id)}
                        >
                            {tab.label}
                        </TabButton>
                    ))}
                </div>

                <div className="flex items-center justify-between pt-2">
                    <div className="flex items-center gap-2">
                        <Button variant="outline" className="h-9 border-dashed">
                            <SlidersHorizontal className="mr-2 h-3.5 w-3.5" />
                            Filters
                        </Button>
                        <Button variant="outline" className="h-9 border-dashed">
                            <User className="mr-2 h-3.5 w-3.5" />
                            Assignee
                        </Button>
                        <Button variant="outline" className="h-9 border-dashed">
                            <Flag className="mr-2 h-3.5 w-3.5" />
                            Priority
                        </Button>
                        <Button variant="outline" className="h-9 border-dashed">
                            <Calendar className="mr-2 h-3.5 w-3.5" />
                            Due Date
                        </Button>
                        <Button variant="ghost" className="h-9 text-muted-foreground hover:text-foreground text-sm">
                            Reset Filters
                        </Button>
                    </div>

                    <div className="flex items-center gap-2">
                        <div className="relative w-64">
                            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                            <Input placeholder="Search tasks..." className="pl-9 h-9" />
                        </div>
                        <span className="text-sm text-muted-foreground mx-2">12 tasks</span>
                    </div>
                </div>
            </div>

            {/* Main Content Area */}
            <div className="flex-1 min-h-0 flex bg-muted/10">
                {/* Task List */}
                <div className={`flex-1 overflow-y-auto p-6 transition-all duration-300 ${selectedTaskId ? 'pr-2' : ''}`}>
                    <div className="rounded-lg border bg-background shadow-sm overflow-hidden">
                        {/* List Header */}
                        <div className="grid grid-cols-[30px_2fr_120px_120px_140px_80px_50px] gap-4 px-6 py-3 text-xs font-semibold text-muted-foreground bg-muted/5 border-b border-border items-center">
                            <div className="flex items-center justify-center">
                                {/* Header Checkbox mock */}
                                <div className="h-4 w-4 rounded border border-input" />
                            </div>
                            <div>TASK TITLE</div>
                            <div className={`${selectedTaskId ? 'hidden xl:block' : ''}`}>BOARD</div>
                            <div className={`${selectedTaskId ? 'hidden' : 'block'}`}>STATUS</div>
                            <div className={`${selectedTaskId ? 'hidden md:block' : ''}`}>DUE DATE</div>
                            <div className={`${selectedTaskId ? 'hidden lg:block' : ''}`}>PRIORITY</div>
                            <div className="text-right">ACTIONS</div>
                        </div>

                        {/* Rows */}
                        <div className="divide-y divide-border">
                            {tasks.map(task => (
                                <div
                                    key={task.id}
                                    onClick={() => setSelectedTaskId(task.id === selectedTaskId ? null : task.id)}
                                    className={`grid grid-cols-[30px_2fr_120px_120px_140px_80px_50px] gap-4 px-6 py-4 items-center cursor-pointer transition-colors hover:bg-muted/50 ${selectedTaskId === task.id ? 'bg-primary/5 hover:bg-primary/10' : ''}`}
                                >
                                    <div className="flex items-center justify-center" onClick={(e) => e.stopPropagation()}>
                                        <input type="checkbox" className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary accent-primary cursor-pointer" />
                                    </div>
                                    <div className="flex items-center gap-3 overflow-hidden">
                                        <div className="min-w-0 font-medium text-sm truncate text-foreground">
                                            {task.title}
                                        </div>
                                    </div>
                                    <div className={`${selectedTaskId ? 'hidden xl:block' : ''}`}>
                                        <BoardBadge board={task.board} />
                                    </div>
                                    <div className={`${selectedTaskId ? 'hidden' : 'block'}`}>
                                        <StatusBadge status={task.status} />
                                    </div>
                                    <div className={`text-sm text-muted-foreground flex items-center gap-2 ${selectedTaskId ? 'hidden md:block' : ''}`}>
                                        {task.due.includes("Jan 17") || task.due.includes("Jan 19") ? (
                                            <AlertCircleIcon className="h-4 w-4 text-rose-500" />
                                        ) : (
                                            <Calendar className="h-4 w-4 text-slate-400" />
                                        )}
                                        <span className={task.due.includes("Jan 17") || task.due.includes("Jan 19") ? "text-rose-600 font-medium" : ""}>{task.due}</span>
                                    </div>
                                    <div className={`${selectedTaskId ? 'hidden lg:block' : ''}`}>
                                        <PriorityBadge priority={task.priority} />
                                    </div>
                                    <div className="flex justify-end" onClick={(e) => e.stopPropagation()}>
                                        <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground">
                                            <MoreVertical className="h-4 w-4" />
                                        </Button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                    {/* Pagination */}
                    <div className="mt-4 flex items-center justify-between px-2">
                        <span className="text-sm text-muted-foreground">Showing 1-8 of 12 tasks</span>
                        <div className="flex items-center gap-1">
                            <Button variant="outline" size="sm" className="h-8 bg-background" disabled>
                                Previous
                            </Button>
                            <Button variant="default" size="sm" className="h-8 w-8 bg-primary text-primary-foreground p-0">1</Button>
                            <Button variant="outline" size="sm" className="h-8 w-8 bg-background p-0">2</Button>
                            <Button variant="outline" size="sm" className="h-8 bg-background">
                                Next
                            </Button>
                        </div>
                    </div>
                </div>

            </div>

            {/* Detail Modal / Sheet Overlay */}
            {selectedTaskId && (
                <div className="fixed inset-0 z-50 flex justify-end" role="dialog">
                    {/* Backdrop */}
                    <div
                        className="absolute inset-0 bg-black/40 backdrop-blur-[2px] animate-in fade-in duration-300"
                        onClick={() => setSelectedTaskId(null)}
                    />

                    {/* Panel */}
                    <div className="relative w-full max-w-lg h-full border-l border-border bg-background flex flex-col shadow-2xl animate-in slide-in-from-right-10 duration-300">
                        {(() => {
                            const activeTask = tasks.find(t => t.id === selectedTaskId) || tasks[0]
                            return (
                                <>
                                    {/* Panel Header */}
                                    <div className="p-6 border-b border-border flex items-center justify-between bg-background">
                                        <div className="flex items-center gap-3">
                                            <BoardBadge board={activeTask.board} />
                                            <div className="h-4 w-px bg-border" />
                                            <span className="text-sm font-medium text-muted-foreground">TASK-{activeTask.id}</span>
                                        </div>
                                        <div className="flex items-center gap-1 -mr-2">
                                            <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground">
                                                <MoreHorizontal className="h-4 w-4" />
                                            </Button>
                                            <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground" onClick={() => setSelectedTaskId(null)}>
                                                <X className="h-4 w-4" />
                                            </Button>
                                        </div>
                                    </div>

                                    {/* Panel Body */}
                                    <div className="flex-1 overflow-y-auto p-6 space-y-8">
                                        <div>
                                            <div className="flex items-start justify-between gap-4 mb-4">
                                                <h2 className="text-2xl font-bold leading-tight text-foreground">{activeTask.title}</h2>
                                            </div>
                                            <div className="flex items-center gap-3 text-sm">
                                                <StatusBadge status={activeTask.status} />
                                                <span className="text-muted-foreground">&bull;</span>
                                                <span className="text-muted-foreground">Created just now</span>
                                            </div>
                                        </div>

                                        <div className="grid grid-cols-2 gap-6 p-5 bg-muted/30 rounded-lg border border-border/50">
                                            <div className="space-y-1.5">
                                                <span className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">Due Date</span>
                                                <div className="flex items-center gap-2 text-sm font-medium">
                                                    <Calendar className="h-4 w-4 text-muted-foreground" />
                                                    <span>{activeTask.due}</span>
                                                </div>
                                            </div>
                                            <div className="space-y-1.5">
                                                <span className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">Priority</span>
                                                <div className="flex items-center gap-2">
                                                    <PriorityBadge priority={activeTask.priority} />
                                                </div>
                                            </div>
                                            <div className="col-span-2 space-y-1.5 pt-2 border-t border-border/50">
                                                <span className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">Tags</span>
                                                <div className="flex flex-wrap items-center gap-2">
                                                    <Badge variant="secondary" className="rounded-md px-2.5 py-1 font-normal bg-background border border-border">Feature</Badge>
                                                    <Badge variant="secondary" className="rounded-md px-2.5 py-1 font-normal bg-background border border-border">Q1 Goal</Badge>
                                                    <button className="h-6 w-6 rounded-full border border-dashed border-muted-foreground/50 flex items-center justify-center hover:bg-muted text-muted-foreground transition-colors">
                                                        <Plus className="h-3 w-3" />
                                                    </button>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="space-y-3">
                                            <label className="text-base font-semibold text-foreground">Description</label>
                                            <div className="min-h-[120px] text-sm leading-relaxed text-muted-foreground">
                                                <p className="mb-2">This task needs to be completed before the end of the sprint. Please ensure all acceptance criteria are met.</p>
                                                <p>Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.</p>
                                            </div>
                                        </div>

                                        <div className="space-y-4">
                                            <div className="flex items-center justify-between">
                                                <label className="text-base font-semibold text-foreground">Attachments</label>
                                                <Button variant="outline" size="sm" className="h-7 text-xs gap-1.5">
                                                    <Plus className="h-3 w-3" /> Add File
                                                </Button>
                                            </div>
                                            <div className="border-2 border-dashed border-muted rounded-xl p-8 flex flex-col items-center justify-center gap-2 text-center hover:bg-muted/30 transition-colors cursor-pointer group">
                                                <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center group-hover:scale-110 transition-transform">
                                                    <Paperclip className="h-5 w-5 text-muted-foreground" />
                                                </div>
                                                <div className="space-y-1">
                                                    <p className="text-sm font-medium text-foreground">Click to upload or drag and drop</p>
                                                    <p className="text-xs text-muted-foreground">SVG, PNG, JPG or GIF (max. 800x400px)</p>
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Panel Footer (Activity/Comments) */}
                                    <div className="p-6 border-t border-border bg-muted/30 backdrop-blur-sm">
                                        <div className="flex items-center justify-between mb-4">
                                            <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                                                <MessageSquare className="h-4 w-4" />
                                                Comments
                                                <span className="text-muted-foreground font-normal">(2)</span>
                                            </div>
                                        </div>

                                        <div className="flex gap-4">
                                            <Avatar className="h-9 w-9 border-2 border-background shadow-sm">
                                                <AvatarImage src="https://github.com/shadcn.png" />
                                                <AvatarFallback>ME</AvatarFallback>
                                            </Avatar>
                                            <div className="flex-1">
                                                <div className="relative">
                                                    <textarea
                                                        className="w-full text-sm bg-background border border-input rounded-xl px-4 py-3 min-h-[80px] focus:outline-none focus:ring-2 focus:ring-ring/20 focus:border-ring shadow-sm resize-none"
                                                        placeholder="Write a comment..."
                                                    />
                                                    <div className="absolute bottom-2 right-2 flex items-center gap-2">
                                                        <Button size="icon" variant="ghost" className="h-8 w-8 text-muted-foreground hover:text-foreground">
                                                            <Paperclip className="h-4 w-4" />
                                                        </Button>
                                                        <Button size="sm" className="h-8 px-4 rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground">Send</Button>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </>
                            )
                        })()}
                    </div>
                </div>
            )}
        </div>
    )
}

function TabButton({ children, active, onClick }: { children: React.ReactNode, active: boolean, onClick: () => void }) {
    return (
        <button
            onClick={onClick}
            className={`px-1 py-1 text-sm font-medium border-b-2 transition-all whitespace-nowrap ${active
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
        >
            {children}
        </button>
    )
}

function StatusBadge({ status }: { status: string }) {
    // In progress, To Do
    const isProgress = status === 'In Progress'
    const isDone = status === 'Done'

    return (
        <span className={`inline-flex items-center px-2.5 py-0.5 rounded text-xs font-medium ${isProgress ? "bg-primary/10 text-primary" :
            isDone ? "bg-muted text-muted-foreground line-through" :
                "bg-muted text-foreground"
            }`}>
            {status}
        </span>
    )
}

function BoardBadge({ board }: { board: string }) {
    const colors = {
        'Finance': 'bg-pink-100 text-pink-700',
        'Platform': 'bg-blue-100 text-blue-700',
        'Sales': 'bg-green-100 text-green-700',
        'HR': 'bg-purple-100 text-purple-700',
        'Marketing': 'bg-teal-100 text-teal-700',
        'Design System': 'bg-rose-100 text-rose-700',
    }
    const color = colors[board as keyof typeof colors] || 'bg-slate-100 text-slate-700'

    return (
        <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded text-xs font-medium ${color}`}>
            <span className="w-1.5 h-1.5 rounded-full bg-current opacity-50" />
            {board}
        </span>
    )
}

function PriorityBadge({ priority }: { priority: string }) {
    const color = {
        'High': 'text-white bg-red-500',
        'Medium': 'text-amber-800 bg-amber-100',
        'Low': 'text-slate-600 bg-slate-100',
    }[priority] || 'text-slate-500 bg-slate-50'

    return (
        <span className={`inline-flex items-center px-2 py-0.5 rounded textxs font-medium ${color}`}>
            {priority}
        </span>
    )
}

function AlertCircleIcon(props: any) {
    return (
        <svg
            {...props}
            xmlns="http://www.w3.org/2000/svg"
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
        >
            <circle cx="12" cy="12" r="10" />
            <line x1="12" x2="12" y1="8" y2="12" />
            <line x1="12" x2="12.01" y1="16" y2="16" />
        </svg>
    )
}
