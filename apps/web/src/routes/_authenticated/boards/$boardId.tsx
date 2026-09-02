import { createFileRoute } from "@tanstack/react-router"
import { Button } from "@tracky/web/components/ui/button"
import { Badge } from "@tracky/web/components/ui/badge"
import { Avatar, AvatarFallback, AvatarImage } from "@tracky/web/components/ui/avatar"
import { MoreHorizontal, Plus, Calendar, Paperclip, MessageSquare, Lock, CheckCircle2, ChevronRight, Settings, Users, CheckCircle } from "lucide-react"
import { useState } from "react"
import {
    DndContext,
    DragOverlay,
    closestCorners,
    KeyboardSensor,
    PointerSensor,
    useSensor,
    useSensors,
    type DragStartEvent,
    type DragOverEvent,
    type DragEndEvent,
    defaultDropAnimationSideEffects,
    type DropAnimation,
} from "@dnd-kit/core"
import {
    arrayMove,
    SortableContext,
    sortableKeyboardCoordinates,
    verticalListSortingStrategy,
    useSortable,
} from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"

export const Route = createFileRoute("/_authenticated/boards/$boardId")({
    component: BoardDetail,
})

// Types
type Task = {
    id: string
    title: string
    date: string
    comments?: number
    attachments?: number
    priority?: 'red' | 'yellow' | 'blue' | 'grey'
    avatars: number[]
    isDone?: boolean
}

type Column = {
    id: string
    title: string
    tasks: Task[]
    isDoneColumn?: boolean
}

// Initial Mock Data
const initialColumns: Column[] = [
    {
        id: "backlog",
        title: "Backlog",
        tasks: [
            { id: "t1", title: "User authentication system", date: "Mar 25", attachments: 2, comments: 3, priority: "red", avatars: [1, 2] },
            { id: "t2", title: "Database schema design", date: "Mar 28", comments: 1, priority: "yellow", avatars: [3] },
            { id: "t3", title: "API documentation", date: "Apr 2", attachments: 1, priority: "blue", avatars: [4] },
            { id: "t4", title: "Payment gateway integration", date: "Apr 5", comments: 2, priority: "red", avatars: [1, 3] },
            { id: "t5", title: "Mobile responsiveness", date: "Apr 8", priority: "yellow", avatars: [2] },
            { id: "t6", title: "Security audit", date: "Apr 10", attachments: 3, priority: "red", avatars: [5] },
        ]
    },
    {
        id: "todo",
        title: "To Do",
        tasks: [
            { id: "t7", title: "Dashboard UI redesign", date: "Mar 30", comments: 5, priority: "yellow", avatars: [2, 4] },
            { id: "t8", title: "Email notification system", date: "Apr 1", attachments: 1, priority: "blue", avatars: [3] },
            { id: "t9", title: "Search functionality", date: "Apr 3", comments: 2, priority: "yellow", avatars: [5] },
            { id: "t10", title: "Performance optimization", date: "Apr 6", priority: "red", avatars: [1, 2] },
            { id: "t11", title: "Analytics integration", date: "Apr 9", attachments: 2, comments: 1, priority: "blue", avatars: [4] },
        ]
    },
    {
        id: "in_progress",
        title: "In Progress",
        tasks: [
            { id: "t12", title: "User profile page", date: "Mar 29", comments: 4, priority: "yellow", avatars: [1] },
            { id: "t13", title: "Shopping cart feature", date: "Apr 2", attachments: 3, comments: 7, priority: "red", avatars: [2, 3, 4] },
            { id: "t14", title: "Product filtering", date: "Apr 4", comments: 2, priority: "blue", avatars: [5] },
            { id: "t15", title: "Admin dashboard", date: "Apr 7", comments: 1, priority: "yellow", avatars: [1, 3] },
        ]
    },
    {
        id: "testing",
        title: "Testing",
        tasks: [
            { id: "t16", title: "Login flow testing", date: "Mar 27", comments: 3, priority: "blue", avatars: [2] },
            { id: "t17", title: "Payment processing QA", date: "Apr 1", attachments: 2, comments: 5, priority: "red", avatars: [4] },
            { id: "t18", title: "Cross-browser testing", date: "Apr 3", priority: "yellow", avatars: [1] },
            { id: "t19", title: "Load testing", date: "Apr 5", comments: 1, priority: "red", avatars: [3, 5] },
            { id: "t20", title: "Accessibility audit", date: "Apr 8", attachments: 1, priority: "blue", avatars: [2] },
        ]
    },
    {
        id: "done",
        title: "Done",
        isDoneColumn: true,
        tasks: [
            { id: "t21", title: "Initial wireframes", date: "Mar 20", isDone: true, avatars: [1] },
            { id: "t22", title: "Project setup", date: "Mar 22", comments: 2, isDone: true, avatars: [3] },
            { id: "t23", title: "Brand guidelines", date: "Mar 24", attachments: 4, isDone: true, avatars: [2, 4] },
            { id: "t24", title: "Component library", date: "Mar 26", comments: 6, isDone: true, avatars: [5] },
        ]
    }
]

function BoardDetail() {
    const [columns, setColumns] = useState<Column[]>(initialColumns)
    const [activeId, setActiveId] = useState<string | null>(null)

    const sensors = useSensors(
        useSensor(PointerSensor, {
            activationConstraint: {
                distance: 2, // Enable click on buttons inside
            },
        }),
        useSensor(KeyboardSensor, {
            coordinateGetter: sortableKeyboardCoordinates,
        })
    )

    const findColumn = (id: string) => {
        if (columns.find(col => col.id === id)) return id
        return columns.find(col => col.tasks.find(task => task.id === id))?.id
    }

    const handleDragStart = (event: DragStartEvent) => {
        setActiveId(event.active.id as string)
    }

    const handleDragOver = (event: DragOverEvent) => {
        const { active, over } = event
        const overId = over?.id

        if (!overId || active.id === overId) return

        const activeColumnId = findColumn(active.id as string)
        const overColumnId = findColumn(overId as string)

        if (!activeColumnId || !overColumnId || activeColumnId === overColumnId) return

        setColumns(prev => {
            const activeColIndex = prev.findIndex(col => col.id === activeColumnId)
            const overColIndex = prev.findIndex(col => col.id === overColumnId)

            const activeCol = prev[activeColIndex]
            const overCol = prev[overColIndex]

            const activeTaskIndex = activeCol.tasks.findIndex(t => t.id === active.id)
            const overTaskIndex = overCol.tasks.findIndex(t => t.id === overId)

            let newIndex: number
            if (overTaskIndex >= 0) {
                // We're hovering over a task in another column
                newIndex = overTaskIndex + (active.rect.current.translated && active.rect.current.translated.top > over.rect.top ? 1 : 0)
            } else {
                // We're hovering over the column itself
                newIndex = overCol.tasks.length + 1
            }

            // Create new arrays to avoid mutation
            const newActiveTasks = [...activeCol.tasks]
            const [movedTask] = newActiveTasks.splice(activeTaskIndex, 1)

            // If moving to 'Done' column, update status
            if (overCol.isDoneColumn) {
                movedTask.isDone = true
            } else if (activeCol.isDoneColumn) {
                movedTask.isDone = false
            }

            const newOverTasks = [...overCol.tasks]
            newOverTasks.splice(newIndex, 0, movedTask)

            const newColumns = [...prev]
            newColumns[activeColIndex] = { ...activeCol, tasks: newActiveTasks }
            newColumns[overColIndex] = { ...overCol, tasks: newOverTasks }

            return newColumns
        })
    }

    const handleDragEnd = (event: DragEndEvent) => {
        const { active, over } = event
        const activeColumnId = findColumn(active.id as string)
        const overColumnId = findColumn(over?.id as string)

        if (activeColumnId && overColumnId && activeColumnId === overColumnId) {
            const columnIndex = columns.findIndex(col => col.id === activeColumnId)
            const column = columns[columnIndex]
            const oldIndex = column.tasks.findIndex(t => t.id === active.id)
            const newIndex = column.tasks.findIndex(t => t.id === over?.id)

            if (oldIndex !== newIndex) {
                setColumns(prev => {
                    const newColumns = [...prev]
                    newColumns[columnIndex] = {
                        ...column,
                        tasks: arrayMove(column.tasks, oldIndex, newIndex)
                    }
                    return newColumns
                })
            }
        }

        setActiveId(null)
    }

    const dropAnimation: DropAnimation = {
        sideEffects: defaultDropAnimationSideEffects({
            styles: {
                active: {
                    opacity: '0.5',
                },
            },
        }),
    }

    // Find the active task for the overlay
    const activeTask = activeId
        ? columns.flatMap(c => c.tasks).find(t => t.id === activeId)
        : null

    return (
        <div className="flex flex-col h-full animate-in fade-in duration-500 -m-6">
            {/* Header */}
            <div className="h-auto border-b border-border bg-background px-8 py-4 shrink-0 space-y-4">
                {/* Breadcrumbs */}
                <div className="flex items-center text-sm text-muted-foreground gap-2">
                    <span>Boards</span>
                    <ChevronRight className="h-4 w-4" />
                    <span className="font-medium text-foreground">Product Development Q1</span>
                </div>

                {/* Title & Controls */}
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="flex items-center gap-4">
                        <h1 className="text-2xl font-bold text-foreground">Product Development Q1</h1>
                        <div className="flex items-center gap-4 text-sm text-muted-foreground border-l pl-4 h-6">
                            <div className="flex items-center gap-1.5">
                                <Lock className="h-3.5 w-3.5" />
                                <span>Private</span>
                            </div>
                            <div className="flex items-center gap-1.5">
                                <CheckCircle2 className="h-3.5 w-3.5" />
                                <span>24 Tasks</span>
                            </div>
                        </div>
                    </div>

                    <div className="flex items-center gap-2">
                        <Button className="bg-[#0f4c3a] hover:bg-[#0f4c3a]/90 text-white shadow-sm">
                            <Plus className="mr-2 h-4 w-4" />
                            Create Task
                        </Button>
                        <Button variant="outline" className="bg-background">
                            <Settings className="mr-2 h-4 w-4 text-muted-foreground" />
                            Settings
                        </Button>
                        <Button variant="outline" className="bg-background">
                            <Users className="mr-2 h-4 w-4 text-muted-foreground" />
                            Members
                        </Button>
                    </div>
                </div>
            </div>

            {/* Board Canvas */}
            <DndContext
                sensors={sensors}
                collisionDetection={closestCorners}
                onDragStart={handleDragStart}
                onDragOver={handleDragOver}
                onDragEnd={handleDragEnd}
            >
                <div className="flex-1 overflow-x-auto overflow-y-hidden p-6 bg-[#f8f9fc]">
                    <div className="flex h-full gap-6 min-w-max">
                        {columns.map(col => (
                            <BoardColumn
                                key={col.id}
                                id={col.id}
                                title={col.title}
                                tasks={col.tasks}
                                isDoneColumn={col.isDoneColumn}
                            />
                        ))}
                    </div>
                </div>
                <DragOverlay dropAnimation={dropAnimation}>
                    {activeTask ? (
                        <TaskCard task={activeTask} isDoneColumn={activeTask.isDone || columns.find(c => c.id === findColumn(activeTask.id))?.isDoneColumn} />
                    ) : null}
                </DragOverlay>
            </DndContext>
        </div>
    )
}

function BoardColumn({ id, title, tasks, isDoneColumn }: { id: string, title: string, tasks: Task[], isDoneColumn?: boolean }) {
    return (
        <div className="w-[300px] shrink-0 flex flex-col h-full bg-white rounded-xl border border-border shadow-sm">
            {/* Column Header */}
            <div className="p-4 flex items-center justify-between border-b border-border/40">
                <div className="flex items-center gap-2">
                    <h3 className="font-semibold text-sm text-foreground">{title}</h3>
                    <Badge variant="secondary" className="rounded-full px-2 py-0.5 text-[10px] bg-slate-100 text-slate-600 font-medium hover:bg-slate-200">
                        {tasks.length}
                    </Badge>
                </div>
                <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:bg-muted">
                    <MoreHorizontal className="h-4 w-4" />
                </Button>
            </div>

            {/* Tasks List */}
            <div className="flex-1 overflow-y-auto p-3 min-h-0 bg-slate-50/50">
                <SortableContext
                    id={id}
                    items={tasks}
                    strategy={verticalListSortingStrategy}
                >
                    <div className="space-y-3">
                        {tasks.map((task) => (
                            <SortableTaskCard key={task.id} task={task} isDoneColumn={isDoneColumn} />
                        ))}
                    </div>
                </SortableContext>
            </div>

            {/* Column Footer */}
            <div className="p-3 border-t border-border/40 bg-white rounded-b-xl">
                <Button variant="ghost" className="w-full justify-start text-muted-foreground hover:text-foreground text-sm font-normal h-9">
                    <Plus className="mr-2 h-4 w-4" />
                    Add Task
                </Button>
            </div>
        </div>
    )
}

function SortableTaskCard({ task, isDoneColumn }: { task: Task, isDoneColumn?: boolean }) {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging,
    } = useSortable({ id: task.id, data: { ...task, isDoneColumn } })

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.3 : 1,
    }

    return (
        <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
            <TaskCard task={task} isDoneColumn={isDoneColumn} />
        </div>
    )
}

function TaskCard({ task, isDoneColumn }: { task: Task, isDoneColumn?: boolean }) {
    const { title, date, comments, attachments, priority, avatars } = task

    // Check if task is done based on prop OR column context (for visual consistency)
    const isDone = isDoneColumn || task.isDone;

    const priorityColor =
        priority === 'red' ? 'bg-rose-500' :
            priority === 'yellow' ? 'bg-amber-400' :
                priority === 'blue' ? 'bg-blue-500' :
                    'bg-slate-300';

    return (
        <div className={`bg-white p-3.5 rounded-lg border border-border shadow-[0_1px_2px_rgba(0,0,0,0.05)] hover:shadow-md transition-all cursor-pointer group relative select-none`}>
            <div className="flex justify-between items-start mb-2">
                <h4 className={`text-sm font-medium leading-normal ${isDone ? 'text-muted-foreground line-through decoration-slate-300' : 'text-foreground'}`}>
                    {title}
                </h4>
                {isDone ? (
                    <CheckCircle className="h-4 w-4 text-emerald-500 shrink-0 mt-0.5" />
                ) : (
                    <div className={`h-2 w-2 rounded-full shrink-0 mt-1.5 ${priorityColor}`} />
                )}
            </div>

            <div className="flex items-center justify-between mt-3">
                <div className="flex items-center gap-3 text-muted-foreground">
                    <div className="flex items-center gap-1.5 text-[11px]">
                        <Calendar className="h-3 w-3" />
                        <span>{date}</span>
                    </div>
                    {(attachments || comments) && (
                        <div className="flex items-center gap-2">
                            {attachments && (
                                <div className="flex items-center gap-1 text-[11px]">
                                    <Paperclip className="h-3 w-3" />
                                    <span>{attachments}</span>
                                </div>
                            )}
                            {comments && (
                                <div className="flex items-center gap-1 text-[11px]">
                                    <MessageSquare className="h-3 w-3" />
                                    <span>{comments}</span>
                                </div>
                            )}
                        </div>
                    )}
                </div>

                <div className="flex -space-x-1.5">
                    {avatars.map((a: number) => (
                        <Avatar key={a} className="h-5 w-5 border border-white ring-0">
                            <AvatarImage src={`https://github.com/shadcn.png`} />
                            <AvatarFallback className="text-[8px]">U</AvatarFallback>
                        </Avatar>
                    ))}
                </div>
            </div>
        </div>
    )
}
