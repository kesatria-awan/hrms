import { createFileRoute, Link, useNavigate } from "@tanstack/react-router"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { Button } from "@tracky/web/components/ui/button"
import { Badge } from "@tracky/web/components/ui/badge"
import { Avatar, AvatarFallback, AvatarImage } from "@tracky/web/components/ui/avatar"
import { Input } from "@tracky/web/components/ui/input"
import { Textarea } from "@tracky/web/components/ui/textarea"
import { Label } from "@tracky/web/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@tracky/web/components/ui/dialog"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@tracky/web/components/ui/alert-dialog"
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
  MoreHorizontal,
  Plus,
  CheckCircle2,
  ChevronRight,
  Settings,
  Users,
  Loader2,
  ArrowLeft,
  Trash2,
  UserPlus,
  Crown,
  UserMinus,
  Eye,
  Archive,
  ArchiveRestore,
} from "lucide-react"
import { useState, useMemo } from "react"
import {
  DndContext,
  DragOverlay,
  pointerWithin,
  rectIntersection,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  useDroppable,
  type DragStartEvent,
  type DragOverEvent,
  type DragEndEvent,
  defaultDropAnimationSideEffects,
  type DropAnimation,
  type CollisionDetection,
} from "@dnd-kit/core"
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { useApi } from "@tracky/web/hooks/use-api"
import {
  useTasksByBoard,
  useMoveTask,
  useReorderTasks,
  useUnarchiveTask,
  type Task,
} from "@tracky/web/hooks/use-tasks"
import { TaskCard } from "@tracky/web/components/task-card"
import { CreateTaskDialog } from "@tracky/web/components/create-task-dialog"
import { TaskDetailPanel } from "@tracky/web/components/task-detail-panel"


export const Route = createFileRoute("/_authenticated/boards/$boardId")({
  component: BoardDetail,
})

// Type for board access permissions
type BoardAccess = {
  canView: boolean
  canEdit: boolean
  canDelete: boolean
  canEditTasks: boolean
  canDeleteTasks: boolean
  canManageMembers: boolean
  canViewMembers: boolean
  canComment: boolean
  canUpload: boolean
  role: "admin" | "member" | "guest" | null
}

// Type for board from API
type Board = {
  id: string
  name: string
  description: string | null
  color: string
  autoArchiveDoneDays: number | null
  columns: {
    id: string
    name: string
    position: number
    isDefault: boolean
    isDoneColumn: boolean
  }[]
  access: BoardAccess
}

// Type for column in settings
type SettingsColumn = {
  id: string
  name: string
  position: number
  isDefault: boolean
  isDoneColumn: boolean
  isEditing?: boolean
}

// Settings modal tabs
type SettingsTab = "general" | "columns" | "danger"

// Type for column with tasks for kanban view
type ColumnWithTasks = {
  id: string
  title: string
  tasks: Task[]
  isDoneColumn?: boolean
}

function BoardDetail() {
  const { boardId } = Route.useParams()
  const api = useApi()
  const navigate = useNavigate()
  // Settings modal state
  const [settingsOpen, setSettingsOpen] = useState(false)

  // Members modal state
  const [membersOpen, setMembersOpen] = useState(false)

  // Archive view state
  const [showArchived, setShowArchived] = useState(false)

  // Create task dialog state
  const [createTaskOpen, setCreateTaskOpen] = useState(false)
  const [createTaskColumnId, setCreateTaskColumnId] = useState<string>("")
  const [createTaskColumnName, setCreateTaskColumnName] = useState<string>("")

  // Task detail panel state
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null)
  const [selectedTaskColumnName, setSelectedTaskColumnName] = useState<string>("")

  // Fetch board with columns
  const {
    data: board,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["board", boardId],
    queryFn: async () => {
      const response = await api.boards[":id"].$get({
        param: { id: boardId },
      })
      if (!response.ok) {
        throw new Error("Failed to fetch board")
      }
      return response.json()
    },
  })

  // Fetch tasks for board
  const { data: tasks = [] } = useTasksByBoard(boardId)

  // Fetch archived tasks (only when viewing archive)
  const { data: archivedTasks = [], isLoading: archivedLoading } = useTasksByBoard(boardId, { archived: true })

  // Task mutations
  const moveTaskMutation = useMoveTask()
  const reorderTasksMutation = useReorderTasks()
  const unarchiveTaskMutation = useUnarchiveTask()

  // Current user's board access from board response
  const access = board?.access
  const isBoardAdmin = access?.canEdit ?? false

  // Fetch board members for task assignments (only if user can view members)
  const { data: boardMembersData } = useQuery({
    queryKey: ["board-members", boardId],
    queryFn: async () => {
      const response = await api.boards[":id"].members.$get({
        param: { id: boardId },
      })
      if (!response.ok) {
        return { members: [] }
      }
      return response.json()
    },
    enabled: !!board && access?.canViewMembers !== false,
  })

  // Transform board members to the format expected by CreateTaskDialog and TaskDetailPanel
  const boardMembers = (boardMembersData?.members || []).map((member) => ({
    userId: member.userId,
    email: member.user.email,
    firstName: member.user.firstName,
    lastName: member.user.lastName,
    imageUrl: member.user.imageUrl,
    role: member.role,
  }))

  // Local state for optimistic drag-drop updates
  const [localTasksByColumn, setLocalTasksByColumn] = useState<Record<string, Task[]> | null>(null)

  // Derive columns with tasks from board data and API tasks
  const columnsWithTasks: ColumnWithTasks[] = useMemo(() => {
    if (!board) return []

    // Group tasks by columnId
    const tasksByColumn: Record<string, Task[]> = {}
    board.columns.forEach((col) => {
      tasksByColumn[col.id] = []
    })

    // Use local state if available (during optimistic updates), otherwise use API data
    const tasksToUse = localTasksByColumn || null
    if (tasksToUse) {
      return board.columns.map((col) => ({
        id: col.id,
        title: col.name,
        tasks: tasksToUse[col.id] || [],
        isDoneColumn: col.isDoneColumn,
      }))
    }

    // Group tasks from API by column
    tasks.forEach((task) => {
      if (tasksByColumn[task.columnId]) {
        tasksByColumn[task.columnId].push(task)
      }
    })

    // Sort tasks by position within each column
    Object.keys(tasksByColumn).forEach((colId) => {
      tasksByColumn[colId].sort((a, b) => a.position - b.position)
    })

    return board.columns.map((col) => ({
      id: col.id,
      title: col.name,
      tasks: tasksByColumn[col.id] || [],
      isDoneColumn: col.isDoneColumn,
    }))
  }, [board, tasks, localTasksByColumn])

  const [activeId, setActiveId] = useState<string | null>(null)
  const [activeColumnIdOnStart, setActiveColumnIdOnStart] = useState<string | null>(null)

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 2,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  )

  // Custom collision detection that's more responsive for kanban boards
  // Uses pointerWithin first (immediate response), then falls back to rectIntersection
  const customCollisionDetection: CollisionDetection = (args) => {
    // First, try pointerWithin - this gives immediate feedback when pointer enters a column
    const pointerCollisions = pointerWithin(args)
    if (pointerCollisions.length > 0) {
      return pointerCollisions
    }
    // Fall back to rectIntersection for edge cases
    return rectIntersection(args)
  }

  const findColumn = (id: string) => {
    if (columnsWithTasks.find((col) => col.id === id)) return id
    return columnsWithTasks.find((col) => col.tasks.find((task) => task.id === id))?.id
  }

  const handleDragStart = (event: DragStartEvent) => {
    const taskId = event.active.id as string
    setActiveId(taskId)
    // Store the original column so we know if it's a cross-column move
    const originalColumn = columnsWithTasks.find((col) =>
      col.tasks.find((task) => task.id === taskId)
    )?.id
    setActiveColumnIdOnStart(originalColumn || null)
  }

  const handleDragOver = (event: DragOverEvent) => {
    const { active, over } = event
    const overId = over?.id

    if (!overId || active.id === overId) return

    const activeColumnId = findColumn(active.id as string)
    const overColumnId = findColumn(overId as string)

    if (!activeColumnId || !overColumnId || activeColumnId === overColumnId) return

    const activeCol = columnsWithTasks.find((col) => col.id === activeColumnId)
    const overCol = columnsWithTasks.find((col) => col.id === overColumnId)

    if (!activeCol || !overCol) return

    const activeTaskIndex = activeCol.tasks.findIndex((t) => t.id === active.id)
    const overTaskIndex = overCol.tasks.findIndex((t) => t.id === overId)

    let newIndex: number
    if (overTaskIndex >= 0) {
      newIndex =
        overTaskIndex +
        (active.rect.current.translated && active.rect.current.translated.top > over.rect.top
          ? 1
          : 0)
    } else {
      newIndex = overCol.tasks.length + 1
    }

    const newActiveTasks = [...activeCol.tasks]
    const [movedTask] = newActiveTasks.splice(activeTaskIndex, 1)

    // Create immutable copy before modifying
    const updatedTask = { ...movedTask, columnId: overColumnId }

    const newOverTasks = [...overCol.tasks]
    newOverTasks.splice(newIndex, 0, updatedTask)

    // Optimistic update for smooth drag
    const newLocalTasks: Record<string, Task[]> = {}
    columnsWithTasks.forEach((col) => {
      if (col.id === activeColumnId) {
        newLocalTasks[col.id] = newActiveTasks
      } else if (col.id === overColumnId) {
        newLocalTasks[col.id] = newOverTasks
      } else {
        newLocalTasks[col.id] = col.tasks
      }
    })
    setLocalTasksByColumn(newLocalTasks)
  }

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event

    // Use the stored original column, not the current position (which may have changed during drag)
    const originalColumnId = activeColumnIdOnStart
    // Find the target column - could be a column id or a task id
    const overColumnId = over?.id ? findColumn(over.id as string) : null

    if (!originalColumnId || !overColumnId) {
      setActiveId(null)
      setActiveColumnIdOnStart(null)
      setLocalTasksByColumn(null)
      return
    }

    // Same column - reorder
    if (originalColumnId === overColumnId) {
      // For same-column reorder, we need to use the original tasks (not optimistic state)
      // Reset local state first to get accurate positions
      setLocalTasksByColumn(null)

      // Find the column from API data
      const tasksByColumn: Record<string, Task[]> = {}
      board?.columns.forEach((col) => {
        tasksByColumn[col.id] = []
      })
      tasks.forEach((task) => {
        if (tasksByColumn[task.columnId]) {
          tasksByColumn[task.columnId].push(task)
        }
      })
      Object.keys(tasksByColumn).forEach((colId) => {
        tasksByColumn[colId].sort((a, b) => a.position - b.position)
      })

      const columnTasks = tasksByColumn[originalColumnId] || []
      const oldIndex = columnTasks.findIndex((t) => t.id === active.id)
      const newIndex = columnTasks.findIndex((t) => t.id === over?.id)

      if (oldIndex !== -1 && newIndex !== -1 && oldIndex !== newIndex) {
        const reorderedTasks = arrayMove(columnTasks, oldIndex, newIndex)

        // Optimistic update
        const newLocalTasks: Record<string, Task[]> = {}
        columnsWithTasks.forEach((col) => {
          if (col.id === originalColumnId) {
            newLocalTasks[col.id] = reorderedTasks
          } else {
            newLocalTasks[col.id] = tasksByColumn[col.id] || []
          }
        })
        setLocalTasksByColumn(newLocalTasks)

        // Call API to reorder
        reorderTasksMutation.mutate(
          {
            boardId,
            columnId: originalColumnId,
            taskIds: reorderedTasks.map((t) => t.id),
          },
          {
            onSettled: () => {
              setLocalTasksByColumn(null)
            },
          }
        )
      }
    } else {
      // Different column - move task
      // The task has already been moved optimistically in handleDragOver
      // Find the position in the target column from the optimistic state
      const overCol = columnsWithTasks.find((col) => col.id === overColumnId)
      if (!overCol) {
        setLocalTasksByColumn(null)
        setActiveId(null)
        setActiveColumnIdOnStart(null)
        return
      }

      // Find the position in the target column
      const taskIndex = overCol.tasks.findIndex((t) => t.id === active.id)
      const position = taskIndex >= 0 ? taskIndex : overCol.tasks.length

      // Call API to move task
      moveTaskMutation.mutate(
        {
          taskId: active.id as string,
          boardId,
          columnId: overColumnId,
          position,
        },
        {
          onSettled: () => {
            setLocalTasksByColumn(null)
          },
        }
      )
    }

    setActiveId(null)
    setActiveColumnIdOnStart(null)
  }

  const dropAnimation: DropAnimation = {
    sideEffects: defaultDropAnimationSideEffects({
      styles: {
        active: {
          opacity: "0.5",
        },
      },
    }),
  }

  const activeTask = activeId
    ? columnsWithTasks.flatMap((c) => c.tasks).find((t) => t.id === activeId)
    : null

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (error || !board) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4">
        <p className="text-destructive">Failed to load board</p>
        <Link to="/boards">
          <Button variant="outline">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Boards
          </Button>
        </Link>
      </div>
    )
  }

  const totalTasks = columnsWithTasks.reduce((acc, col) => acc + col.tasks.length, 0)

  return (
    <div className="flex flex-col h-full animate-in fade-in duration-500 -m-6">
      {/* Header */}
      <div className="h-auto border-b border-border bg-background px-8 py-4 shrink-0 space-y-4">
        {/* Breadcrumbs */}
        <div className="flex items-center text-sm text-muted-foreground gap-2">
          <Link to="/boards" className="hover:text-foreground transition-colors">
            Boards
          </Link>
          <ChevronRight className="h-4 w-4" />
          <span className="font-medium text-foreground">{board.name}</span>
        </div>

        {/* Title & Controls */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div
              className="h-3 w-3 rounded-full"
              style={{ backgroundColor: board.color }}
            />
            <h1 className="text-2xl font-bold text-foreground">{board.name}</h1>
            <div className="flex items-center gap-4 text-sm text-muted-foreground border-l pl-4 h-6">
              <div className="flex items-center gap-1.5">
                <CheckCircle2 className="h-3.5 w-3.5" />
                <span>{totalTasks} Tasks</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {access?.canEditTasks && (
              <Button
                className="bg-[#0f4c3a] hover:bg-[#0f4c3a]/90 text-white shadow-sm"
                onClick={() => {
                  // Default to first column
                  const firstColumn = board?.columns[0]
                  if (firstColumn) {
                    setCreateTaskColumnId(firstColumn.id)
                    setCreateTaskColumnName(firstColumn.name)
                    setCreateTaskOpen(true)
                  }
                }}
              >
                <Plus className="mr-2 h-4 w-4" />
                Create Task
              </Button>
            )}
            {isBoardAdmin && (
              <Button
                variant="outline"
                className="bg-background"
                onClick={() => setSettingsOpen(true)}
              >
                <Settings className="mr-2 h-4 w-4 text-muted-foreground" />
                Settings
              </Button>
            )}
            {access?.canViewMembers && (
              <Button
                variant="outline"
                className="bg-background"
                onClick={() => setMembersOpen(true)}
              >
                <Users className="mr-2 h-4 w-4 text-muted-foreground" />
                Members
              </Button>
            )}
            <Button
              variant="outline"
              className="bg-background"
              onClick={() => setShowArchived(true)}
            >
              <Archive className="mr-2 h-4 w-4 text-muted-foreground" />
              Archived
              {archivedTasks.length > 0 && (
                <Badge variant="secondary" className="ml-1.5 h-5 px-1.5 text-xs">
                  {archivedTasks.length}
                </Badge>
              )}
            </Button>
          </div>
        </div>

        {board.description && (
          <p className="text-sm text-muted-foreground">{board.description}</p>
        )}
      </div>

      {/* Board Canvas */}
      <DndContext
        sensors={sensors}
        collisionDetection={customCollisionDetection}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
      >
        <div className="flex-1 overflow-x-auto overflow-y-hidden p-6 bg-[#f8f9fc]">
          <div className="flex h-full gap-6 min-w-max">
            {columnsWithTasks.map((col) => (
              <BoardColumn
                key={col.id}
                id={col.id}
                title={col.title}
                tasks={col.tasks}
                isDoneColumn={col.isDoneColumn}
                canEditTasks={access?.canEditTasks ?? false}
                onAddTask={() => {
                  setCreateTaskColumnId(col.id)
                  setCreateTaskColumnName(col.title)
                  setCreateTaskOpen(true)
                }}
                onTaskClick={(taskId) => {
                  setSelectedTaskId(taskId)
                  setSelectedTaskColumnName(col.title)
                }}
              />
            ))}
          </div>
        </div>
        <DragOverlay dropAnimation={dropAnimation}>
          {activeTask ? (
            <TaskCard
              task={activeTask}
              isDoneColumn={
                !!activeTask.completedAt ||
                columnsWithTasks.find((c) => c.id === findColumn(activeTask.id))?.isDoneColumn
              }
              assignees={activeTask.assignees}
            />
          ) : null}
        </DragOverlay>
      </DndContext>

      {/* Archived Tasks Dialog */}
      <Dialog open={showArchived} onOpenChange={setShowArchived}>
        <DialogContent className="max-w-lg max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Archive className="h-5 w-5 text-muted-foreground" />
              Archived Tasks
            </DialogTitle>
            <DialogDescription>
              {archivedTasks.length} archived task{archivedTasks.length !== 1 ? "s" : ""} in this board
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto space-y-2">
            {archivedLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : archivedTasks.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                <Archive className="h-10 w-10 mb-3 opacity-50" />
                <p className="text-sm">No archived tasks</p>
              </div>
            ) : (
              archivedTasks.map((task) => (
                <div
                  key={task.id}
                  className="flex items-center justify-between rounded-lg border p-3 hover:bg-muted/50 transition-colors cursor-pointer"
                  onClick={() => {
                    setShowArchived(false)
                    setSelectedTaskId(task.id)
                    setSelectedTaskColumnName(
                      board?.columns.find((c) => c.id === task.columnId)?.name ?? ""
                    )
                  }}
                >
                  <div className="flex-1 min-w-0 mr-3">
                    <p className="font-medium truncate text-sm">{task.title}</p>
                    <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                      {task.priority && (
                        <Badge variant="outline" className="text-xs">
                          {task.priority}
                        </Badge>
                      )}
                      <span>
                        {task.archivedAt ? new Date(task.archivedAt).toLocaleDateString() : ""}
                      </span>
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation()
                      unarchiveTaskMutation.mutate({ taskId: task.id, boardId })
                    }}
                    disabled={unarchiveTaskMutation.isPending}
                  >
                    <ArchiveRestore className="mr-1.5 h-3.5 w-3.5" />
                    Unarchive
                  </Button>
                </div>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Settings Modal */}
      {settingsOpen && (
        <BoardSettingsModal
          board={board}
          open={settingsOpen}
          onOpenChange={setSettingsOpen}
          onBoardDeleted={() => navigate({ to: "/boards" })}
        />
      )}

      {/* Members Modal */}
      {membersOpen && access?.canViewMembers && (
        <BoardMembersModal
          boardId={board.id}
          open={membersOpen}
          onOpenChange={setMembersOpen}
          canManageMembers={access?.canManageMembers ?? false}
        />
      )}

      {/* Create Task Dialog */}
      <CreateTaskDialog
        open={createTaskOpen}
        onOpenChange={setCreateTaskOpen}
        boardId={boardId}
        columnId={createTaskColumnId}
        columnName={createTaskColumnName}
        workspaceMembers={boardMembers}
      />

      {/* Task Detail Panel */}
      {selectedTaskId && (
        <TaskDetailPanel
          taskId={selectedTaskId}
          boardId={boardId}
          columnName={selectedTaskColumnName}
          onClose={() => setSelectedTaskId(null)}
          workspaceMembers={boardMembers}
          canDeleteAnyComment={access?.canEdit ?? false}
        />
      )}
    </div>
  )
}

function BoardColumn({
  id,
  title,
  tasks,
  isDoneColumn,
  canEditTasks,
  onAddTask,
  onTaskClick,
}: {
  id: string
  title: string
  tasks: Task[]
  isDoneColumn?: boolean
  canEditTasks: boolean
  onAddTask: () => void
  onTaskClick: (taskId: string) => void
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: id,
  })

  return (
    <div className={`w-[300px] shrink-0 flex flex-col h-full bg-white rounded-xl border shadow-sm transition-colors ${isOver ? "border-primary/50 bg-primary/5" : "border-border"}`}>
      {/* Column Header */}
      <div className="p-4 flex items-center justify-between border-b border-border/40">
        <div className="flex items-center gap-2">
          <h3 className="font-semibold text-sm text-foreground">{title}</h3>
          <Badge
            variant="secondary"
            className="rounded-full px-2 py-0.5 text-[10px] bg-slate-100 text-slate-600 font-medium hover:bg-slate-200"
          >
            {tasks.length}
          </Badge>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 text-muted-foreground hover:bg-muted"
        >
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </div>

      {/* Tasks List - This is the droppable area */}
      <div
        ref={setNodeRef}
        className={`flex-1 overflow-y-auto p-3 min-h-[100px] bg-slate-50/50 ${isOver ? "bg-primary/5" : ""}`}
      >
        <SortableContext id={id} items={tasks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
          <div className="space-y-3 min-h-[50px]">
            {tasks.map((task) => (
              <SortableTaskCard
                key={task.id}
                task={task}
                isDoneColumn={isDoneColumn}
                onClick={() => onTaskClick(task.id)}
              />
            ))}
          </div>
        </SortableContext>
      </div>

      {/* Column Footer */}
      {canEditTasks && (
        <div className="p-3 border-t border-border/40 bg-white rounded-b-xl">
          <Button
            variant="ghost"
            className="w-full justify-start text-muted-foreground hover:text-foreground text-sm font-normal h-9"
            onClick={onAddTask}
          >
            <Plus className="mr-2 h-4 w-4" />
            Add Task
          </Button>
        </div>
      )}
    </div>
  )
}

function SortableTaskCard({
  task,
  isDoneColumn,
  onClick,
}: {
  task: Task
  isDoneColumn?: boolean
  onClick: () => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: task.id,
    data: { ...task, isDoneColumn },
  })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.3 : 1,
  }

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <TaskCard task={task} isDoneColumn={isDoneColumn} onClick={onClick} assignees={task.assignees} />
    </div>
  )
}

// Board Settings Modal Component
function BoardSettingsModal({
  board,
  open,
  onOpenChange,
  onBoardDeleted,
}: {
  board: Board
  open: boolean
  onOpenChange: (open: boolean) => void
  onBoardDeleted: () => void
}) {
  const api = useApi()
  const queryClient = useQueryClient()
  const [activeTab, setActiveTab] = useState<SettingsTab>("general")

  // Form state for General section
  const [name, setName] = useState(board.name)
  const [description, setDescription] = useState(board.description || "")

  // Form state for Columns section
  const [columns, setColumns] = useState<SettingsColumn[]>(
    board.columns.map((col) => ({ ...col, isEditing: false }))
  )
  const [newColumnName, setNewColumnName] = useState("")

  // Update board mutation
  const updateBoardMutation = useMutation({
    mutationFn: async (data: { name?: string; description?: string }) => {
      const response = await api.boards[":id"].$patch({
        param: { id: board.id },
        json: data,
      })
      if (!response.ok) {
        throw new Error("Failed to update board")
      }
      return response.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["board", board.id] })
      queryClient.invalidateQueries({ queryKey: ["boards"] })
    },
  })

  // Delete board mutation
  const deleteBoardMutation = useMutation({
    mutationFn: async () => {
      const response = await api.boards[":id"].$delete({
        param: { id: board.id },
      })
      if (!response.ok) {
        throw new Error("Failed to delete board")
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["boards"] })
      onOpenChange(false)
      onBoardDeleted()
    },
  })

  // Create column mutation
  const createColumnMutation = useMutation({
    mutationFn: async (columnName: string) => {
      const response = await api.columns.$post({
        json: {
          boardId: board.id,
          name: columnName,
        },
      })
      if (!response.ok) {
        throw new Error("Failed to create column")
      }
      return response.json()
    },
    onSuccess: (newColumn) => {
      queryClient.invalidateQueries({ queryKey: ["board", board.id] })
      setNewColumnName("")
      // Add new column to local state
      setColumns((prev) => [
        ...prev,
        {
          id: newColumn.id,
          name: newColumn.name,
          position: newColumn.position,
          isDefault: newColumn.isDefault,
          isDoneColumn: newColumn.isDoneColumn,
          isEditing: false,
        },
      ])
    },
  })

  // Update column mutation
  const updateColumnMutation = useMutation({
    mutationFn: async ({ id, name, isDoneColumn }: { id: string; name?: string; isDoneColumn?: boolean }) => {
      const response = await api.columns[":id"].$patch({
        param: { id },
        json: { name, isDoneColumn },
      })
      if (!response.ok) {
        throw new Error("Failed to update column")
      }
      return response.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["board", board.id] })
    },
  })

  // Delete column mutation
  const deleteColumnMutation = useMutation({
    mutationFn: async (columnId: string) => {
      const response = await api.columns[":id"].$delete({
        param: { id: columnId },
      })
      if (!response.ok) {
        let message = "Failed to delete column"
        try {
          const error = await response.json()
          message = (error as { message?: string }).message || message
        } catch {
          // Response was not JSON, use default message
        }
        throw new Error(message)
      }
      return columnId
    },
    onSuccess: (deletedColumnId) => {
      queryClient.invalidateQueries({ queryKey: ["board", board.id] })
      // Remove column from local state
      setColumns((prev) => prev.filter((col) => col.id !== deletedColumnId))
    },
  })

  // Reorder columns mutation
  const reorderColumnsMutation = useMutation({
    mutationFn: async (columnIds: string[]) => {
      const response = await api.boards[":boardId"].columns.reorder.$patch({
        param: { boardId: board.id },
        json: { columnIds },
      })
      if (!response.ok) {
        throw new Error("Failed to reorder columns")
      }
      return response.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["board", board.id] })
    },
  })

  const handleSaveGeneral = () => {
    updateBoardMutation.mutate({ name, description: description || undefined })
  }

  const handleAddColumn = () => {
    if (newColumnName.trim()) {
      createColumnMutation.mutate(newColumnName.trim())
    }
  }

  const handleUpdateColumnName = (columnId: string, newName: string) => {
    updateColumnMutation.mutate({ id: columnId, name: newName })
    setColumns((prev) =>
      prev.map((col) =>
        col.id === columnId ? { ...col, name: newName, isEditing: false } : col
      )
    )
  }

  const handleToggleDoneColumn = (columnId: string, isDoneColumn: boolean) => {
    updateColumnMutation.mutate({ id: columnId, isDoneColumn })
    // Update local state immediately
    setColumns((prev) =>
      prev.map((col) =>
        col.id === columnId ? { ...col, isDoneColumn } : col
      )
    )
  }

  const handleDeleteColumn = (columnId: string) => {
    deleteColumnMutation.mutate(columnId)
  }

  const handleMoveColumn = (columnId: string, direction: "up" | "down") => {
    const index = columns.findIndex((col) => col.id === columnId)
    if (
      (direction === "up" && index === 0) ||
      (direction === "down" && index === columns.length - 1)
    ) {
      return
    }

    const newIndex = direction === "up" ? index - 1 : index + 1
    const newColumns = [...columns]
    const [movedColumn] = newColumns.splice(index, 1)
    newColumns.splice(newIndex, 0, movedColumn)
    setColumns(newColumns)

    // Save the new order
    reorderColumnsMutation.mutate(newColumns.map((col) => col.id))
  }

  const tabs: { id: SettingsTab; label: string; icon: React.ReactNode }[] = [
    { id: "general", label: "General", icon: <Settings className="h-4 w-4" /> },
    { id: "columns", label: "Columns", icon: <CheckCircle2 className="h-4 w-4" /> },
    { id: "danger", label: "Danger Zone", icon: <Trash2 className="h-4 w-4" /> },
  ]

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl p-0 gap-0">
        <DialogHeader className="px-6 py-4 border-b">
          <DialogTitle>Board Settings</DialogTitle>
          <DialogDescription>Manage your board settings and preferences</DialogDescription>
        </DialogHeader>

        <div className="flex min-h-[400px]">
          {/* Sidebar Navigation */}
          <div className="w-48 border-r bg-muted/30 p-2">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`w-full flex items-center gap-2 px-3 py-2 text-sm rounded-md transition-colors ${
                  activeTab === tab.id
                    ? "bg-background shadow-sm text-foreground font-medium"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted"
                } ${tab.id === "danger" ? "text-destructive hover:text-destructive" : ""}`}
              >
                {tab.icon}
                {tab.label}
              </button>
            ))}
          </div>

          {/* Content Area */}
          <div className="flex-1 p-6">
            {/* General Tab */}
            {activeTab === "general" && (
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="board-name">Board Name</Label>
                  <Input
                    id="board-name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Enter board name"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="board-description">Description</Label>
                  <Textarea
                    id="board-description"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Enter board description (optional)"
                    rows={3}
                  />
                </div>

                <Button
                  onClick={handleSaveGeneral}
                  disabled={updateBoardMutation.isPending || name.trim() === ""}
                  className="bg-[#0f4c3a] hover:bg-[#0f4c3a]/90"
                >
                  {updateBoardMutation.isPending ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : null}
                  Save Changes
                </Button>
              </div>
            )}

            {/* Columns Tab */}
            {activeTab === "columns" && (
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Manage Columns</Label>
                  <p className="text-sm text-muted-foreground">
                    Add, rename, reorder, or delete columns. Maximum 7 columns per board.
                  </p>
                </div>

                {/* Column List */}
                <div className="space-y-2">
                  {columns.map((column, index) => (
                    <div
                      key={column.id}
                      className="flex items-center gap-2 p-3 rounded-lg border bg-background"
                    >
                      {/* Reorder Buttons */}
                      <div className="flex flex-col gap-0.5">
                        <button
                          onClick={() => handleMoveColumn(column.id, "up")}
                          disabled={index === 0 || reorderColumnsMutation.isPending}
                          className="p-1 text-muted-foreground hover:text-foreground disabled:opacity-30"
                        >
                          <ChevronRight className="h-3 w-3 -rotate-90" />
                        </button>
                        <button
                          onClick={() => handleMoveColumn(column.id, "down")}
                          disabled={index === columns.length - 1 || reorderColumnsMutation.isPending}
                          className="p-1 text-muted-foreground hover:text-foreground disabled:opacity-30"
                        >
                          <ChevronRight className="h-3 w-3 rotate-90" />
                        </button>
                      </div>

                      {/* Column Name */}
                      <div className="flex-1">
                        {column.isEditing ? (
                          <Input
                            autoFocus
                            defaultValue={column.name}
                            onBlur={(e) => handleUpdateColumnName(column.id, e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                handleUpdateColumnName(column.id, e.currentTarget.value)
                              } else if (e.key === "Escape") {
                                setColumns((prev) =>
                                  prev.map((col) =>
                                    col.id === column.id ? { ...col, isEditing: false } : col
                                  )
                                )
                              }
                            }}
                            className="h-8"
                          />
                        ) : (
                          <button
                            onClick={() =>
                              setColumns((prev) =>
                                prev.map((col) =>
                                  col.id === column.id ? { ...col, isEditing: true } : col
                                )
                              )
                            }
                            className="text-sm font-medium hover:underline"
                          >
                            {column.name}
                          </button>
                        )}
                      </div>

                      {/* Badges */}
                      <div className="flex items-center gap-2">
                        {column.isDefault && (
                          <Badge variant="secondary" className="text-xs">
                            Default
                          </Badge>
                        )}
                        {column.isDoneColumn && (
                          <Badge className="text-xs bg-emerald-100 text-emerald-700 hover:bg-emerald-100">
                            Done
                          </Badge>
                        )}
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-1">
                        {!column.isDoneColumn && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleToggleDoneColumn(column.id, true)}
                            className="h-8 text-xs text-muted-foreground"
                          >
                            Mark as Done
                          </Button>
                        )}
                        {column.isDoneColumn && !column.isDefault && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleToggleDoneColumn(column.id, false)}
                            className="h-8 text-xs text-muted-foreground"
                          >
                            Unmark Done
                          </Button>
                        )}
                        {!column.isDefault && (
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-destructive hover:text-destructive"
                                disabled={deleteColumnMutation.isPending}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Delete Column</AlertDialogTitle>
                                <AlertDialogDescription>
                                  Are you sure you want to delete "{column.name}"? This action cannot be undone.
                                  Columns with tasks cannot be deleted.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction
                                  onClick={() => handleDeleteColumn(column.id)}
                                  className="bg-destructive hover:bg-destructive/90"
                                >
                                  Delete
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Add New Column */}
                {columns.length < 7 && (
                  <div className="flex gap-2">
                    <Input
                      placeholder="New column name"
                      value={newColumnName}
                      onChange={(e) => setNewColumnName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          handleAddColumn()
                        }
                      }}
                    />
                    <Button
                      onClick={handleAddColumn}
                      disabled={createColumnMutation.isPending || !newColumnName.trim()}
                      className="bg-[#0f4c3a] hover:bg-[#0f4c3a]/90"
                    >
                      {createColumnMutation.isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Plus className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                )}

                {columns.length >= 7 && (
                  <p className="text-sm text-muted-foreground">
                    Maximum of 7 columns reached.
                  </p>
                )}
              </div>
            )}

            {/* Danger Zone Tab */}
            {activeTab === "danger" && (
              <div className="space-y-4">
                <div className="p-4 rounded-lg border border-destructive/50 bg-destructive/5">
                  <h3 className="text-lg font-semibold text-destructive mb-2">Delete Board</h3>
                  <p className="text-sm text-muted-foreground mb-4">
                    Once you delete this board, there is no going back. All columns and tasks will be permanently removed.
                  </p>

                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="destructive" disabled={deleteBoardMutation.isPending}>
                        {deleteBoardMutation.isPending ? (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                          <Trash2 className="mr-2 h-4 w-4" />
                        )}
                        Delete Board
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                        <AlertDialogDescription>
                          This will permanently delete the board "{board.name}" and all its columns and tasks.
                          This action cannot be undone.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={() => deleteBoardMutation.mutate()}
                          className="bg-destructive hover:bg-destructive/90"
                        >
                          Yes, delete board
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer with Done button */}
        <div className="px-6 py-4 border-t bg-muted/30 flex justify-end">
          <Button
            onClick={async () => {
              await queryClient.invalidateQueries({ queryKey: ["board", board.id] })
              onOpenChange(false)
            }}
            className="bg-[#0f4c3a] hover:bg-[#0f4c3a]/90"
          >
            Done
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// Board Members Modal Component
function BoardMembersModal({
  boardId,
  open,
  onOpenChange,
  canManageMembers,
}: {
  boardId: string
  open: boolean
  onOpenChange: (open: boolean) => void
  canManageMembers: boolean
}) {
  const api = useApi()
  const queryClient = useQueryClient()
  const [selectedUserId, setSelectedUserId] = useState<string>("")
  const [selectedRole, setSelectedRole] = useState<"admin" | "member" | "guest">("member")

  // Fetch board members
  const { data: membersData, isLoading: membersLoading } = useQuery({
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

  // Fetch workspace members (to add new members) - only if user can manage members
  const { data: workspaceData } = useQuery({
    queryKey: ["auth", "me"],
    queryFn: async () => {
      const response = await api.auth.me.$get()
      if (!response.ok) {
        throw new Error("Failed to fetch user")
      }
      return response.json()
    },
    enabled: canManageMembers,
  })

  const workspaceSlug = workspaceData?.workspace?.slug

  const { data: workspaceMembersData } = useQuery({
    queryKey: ["workspace-members", workspaceSlug],
    queryFn: async () => {
      if (!workspaceSlug) return { members: [] }
      const response = await api.workspaces[":slug"].members.$get({
        param: { slug: workspaceSlug },
      })
      if (!response.ok) {
        throw new Error("Failed to fetch workspace members")
      }
      return response.json()
    },
    enabled: canManageMembers && !!workspaceSlug,
  })

  // Add member mutation
  const addMemberMutation = useMutation({
    mutationFn: async ({ userId, role }: { userId: string; role: "admin" | "member" | "guest" }) => {
      const response = await api.boards[":id"].members.$post({
        param: { id: boardId },
        json: { userId, role },
      })
      if (!response.ok) {
        const error = await response.json()
        throw new Error((error as { message?: string }).message || "Failed to add member")
      }
      return response.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["board-members", boardId] })
      setSelectedUserId("")
    },
  })

  // Update member role mutation
  const updateRoleMutation = useMutation({
    mutationFn: async ({ userId, role }: { userId: string; role: "admin" | "member" | "guest" }) => {
      const response = await api.boards[":id"].members[":userId"].$patch({
        param: { id: boardId, userId },
        json: { role },
      })
      if (!response.ok) {
        const error = await response.json()
        throw new Error((error as { message?: string }).message || "Failed to update role")
      }
      return response.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["board-members", boardId] })
    },
  })

  // Remove member mutation
  const removeMemberMutation = useMutation({
    mutationFn: async (userId: string) => {
      const response = await api.boards[":id"].members[":userId"].$delete({
        param: { id: boardId, userId },
      })
      if (!response.ok) {
        const error = await response.json()
        throw new Error((error as { message?: string }).message || "Failed to remove member")
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["board-members", boardId] })
    },
  })

  const members = membersData?.members || []
  const workspaceMembers = workspaceMembersData?.members || []

  // Filter workspace members who are not already board members
  const availableMembers = workspaceMembers.filter(
    (wm) => !members.some((bm) => bm.userId === wm.userId)
  )

  const handleAddMember = () => {
    if (selectedUserId) {
      addMemberMutation.mutate({ userId: selectedUserId, role: selectedRole })
    }
  }

  const getMemberName = (member: typeof members[0]) => {
    const { firstName, lastName, email } = member.user
    if (firstName || lastName) {
      return `${firstName || ""} ${lastName || ""}`.trim()
    }
    return email
  }

  const getMemberInitials = (member: typeof members[0]) => {
    const { firstName, lastName, email } = member.user
    if (firstName && lastName) {
      return `${firstName[0]}${lastName[0]}`.toUpperCase()
    }
    return email[0].toUpperCase()
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Board Members</DialogTitle>
          <DialogDescription>
            Manage who has access to this board and their roles
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Add Member Section - only for users who can manage members */}
          {canManageMembers && availableMembers.length > 0 && (
            <div className="flex gap-2">
              <Select value={selectedUserId} onValueChange={setSelectedUserId}>
                <SelectTrigger className="flex-1">
                  <SelectValue placeholder="Select a workspace member..." />
                </SelectTrigger>
                <SelectContent>
                  {availableMembers.map((wm) => (
                    <SelectItem key={wm.userId} value={wm.userId}>
                      <div className="flex items-center gap-2">
                        <Avatar className="h-6 w-6">
                          <AvatarImage src={wm.imageUrl || undefined} />
                          <AvatarFallback className="bg-slate-200 text-slate-600 text-xs font-medium">
                            {wm.firstName?.[0] || wm.email[0].toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <span>
                          {wm.firstName || wm.lastName
                            ? `${wm.firstName || ""} ${wm.lastName || ""}`.trim()
                            : wm.email}
                        </span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={selectedRole} onValueChange={(v) => setSelectedRole(v as "admin" | "member" | "guest")}>
                <SelectTrigger className="w-[120px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">Admin</SelectItem>
                  <SelectItem value="member">Member</SelectItem>
                  <SelectItem value="guest">Guest</SelectItem>
                </SelectContent>
              </Select>
              <Button
                onClick={handleAddMember}
                disabled={!selectedUserId || addMemberMutation.isPending}
                className="bg-[#0f4c3a] hover:bg-[#0f4c3a]/90"
              >
                {addMemberMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <UserPlus className="h-4 w-4" />
                )}
              </Button>
            </div>
          )}

          {canManageMembers && availableMembers.length === 0 && workspaceMembers.length > 0 && (
            <p className="text-sm text-muted-foreground text-center py-2">
              All workspace members are already added to this board
            </p>
          )}

          {/* Members List */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">Current Members</Label>
            {membersLoading ? (
              <div className="flex justify-center py-4">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : members.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">
                No members yet
              </p>
            ) : (
              <div className="space-y-2">
                {members.map((member) => (
                  <div
                    key={member.id}
                    className="flex items-center justify-between p-3 rounded-lg border bg-background"
                  >
                    <div className="flex items-center gap-3">
                      <Avatar className="h-9 w-9">
                        <AvatarImage src={member.user.imageUrl || undefined} />
                        <AvatarFallback className="bg-slate-200 text-slate-600 text-sm font-medium">
                          {getMemberInitials(member)}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="text-sm font-medium">{getMemberName(member)}</p>
                        <p className="text-xs text-muted-foreground">{member.user.email}</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <Badge
                        variant={member.role === "admin" ? "default" : "secondary"}
                        className={`${
                          member.role === "admin"
                            ? "bg-amber-100 text-amber-700 hover:bg-amber-100"
                            : member.role === "guest"
                              ? "bg-slate-100 text-slate-500 hover:bg-slate-100"
                              : ""
                        }`}
                      >
                        {member.role === "admin" ? (
                          <Crown className="h-3 w-3 mr-1" />
                        ) : member.role === "guest" ? (
                          <Eye className="h-3 w-3 mr-1" />
                        ) : (
                          <Users className="h-3 w-3 mr-1" />
                        )}
                        {member.role === "admin" ? "Admin" : member.role === "guest" ? "Guest" : "Member"}
                      </Badge>

                      {canManageMembers && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          {member.role !== "admin" && (
                            <DropdownMenuItem
                              onClick={() =>
                                updateRoleMutation.mutate({
                                  userId: member.userId,
                                  role: "admin",
                                })
                              }
                              disabled={updateRoleMutation.isPending}
                            >
                              <Crown className="h-4 w-4 mr-2" />
                              Make Admin
                            </DropdownMenuItem>
                          )}
                          {member.role !== "member" && (
                            <DropdownMenuItem
                              onClick={() =>
                                updateRoleMutation.mutate({
                                  userId: member.userId,
                                  role: "member",
                                })
                              }
                              disabled={updateRoleMutation.isPending}
                            >
                              <Users className="h-4 w-4 mr-2" />
                              Make Member
                            </DropdownMenuItem>
                          )}
                          {member.role !== "guest" && (
                            <DropdownMenuItem
                              onClick={() =>
                                updateRoleMutation.mutate({
                                  userId: member.userId,
                                  role: "guest",
                                })
                              }
                              disabled={updateRoleMutation.isPending}
                            >
                              <Eye className="h-4 w-4 mr-2" />
                              Make Guest
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuSeparator />
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <DropdownMenuItem
                                onSelect={(e) => e.preventDefault()}
                                className="text-destructive focus:text-destructive"
                              >
                                <UserMinus className="h-4 w-4 mr-2" />
                                Remove
                              </DropdownMenuItem>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Remove Member</AlertDialogTitle>
                                <AlertDialogDescription>
                                  Are you sure you want to remove {getMemberName(member)} from this
                                  board? They will lose access immediately.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction
                                  onClick={() => removeMemberMutation.mutate(member.userId)}
                                  className="bg-destructive hover:bg-destructive/90"
                                >
                                  Remove
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </DropdownMenuContent>
                      </DropdownMenu>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Footer with Done button */}
        <div className="flex justify-end pt-4 border-t">
          <Button
            onClick={() => onOpenChange(false)}
            className="bg-[#0f4c3a] hover:bg-[#0f4c3a]/90"
          >
            Done
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
