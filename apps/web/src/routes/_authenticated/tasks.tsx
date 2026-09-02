import type React from "react"
import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { useQuery } from "@tanstack/react-query"
import { format, isBefore, addDays } from "date-fns"
import { Button } from "@tracky/web/components/ui/button"
import { Input } from "@tracky/web/components/ui/input"
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@tracky/web/components/ui/dropdown-menu"
import {
  Search,
  Plus,
  Calendar,
  Flag,
  Loader2,
  X,
} from "lucide-react"
import { useState, useMemo } from "react"
import { useApi } from "@tracky/web/hooks/use-api"
import { type Task } from "@tracky/web/hooks/use-tasks"
import { TaskDetailPanel } from "@tracky/web/components/task-detail-panel"
import { PriorityBadge } from "@tracky/web/components/task-card"
import { CreateTaskDialog } from "@tracky/web/components/create-task-dialog"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@tracky/web/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@tracky/web/components/ui/select"
import { Label } from "@tracky/web/components/ui/label"

type TasksSearchParams = {
  taskId?: string
}

export const Route = createFileRoute("/_authenticated/tasks")({
  component: TasksPage,
  validateSearch: (search: Record<string, unknown>): TasksSearchParams => {
    return {
      taskId: typeof search.taskId === "string" ? search.taskId : undefined,
    }
  },
})

type TabId = "due-soon" | "overdue" | "all" | "completed"

// Board type from API (list)
type Board = {
  id: string
  name: string
  color: string
  workspaceId: string
  description: string | null
  visibility: "workspace" | "private"
  autoArchiveDoneDays: number
  createdById: string
  position: number
  createdAt: string
  updatedAt: string
  deletedAt: string | null
}

// Board detail type with columns
type BoardWithColumns = {
  id: string
  name: string
  color: string
  columns: {
    id: string
    name: string
    position: number
    isDefault: boolean
    isDoneColumn: boolean
  }[]
}

// Extended task type with board info
type TaskWithBoard = Task & { boardName: string; boardColor: string }

function TasksPage() {
  const api = useApi()
  const navigate = useNavigate()
  const { taskId: taskIdFromUrl } = Route.useSearch()
  const [activeTab, setActiveTab] = useState<TabId>("all")
  const [searchQuery, setSearchQuery] = useState("")
  const [priorityFilter, setPriorityFilter] = useState<Set<string>>(new Set())
  const [boardFilter, setBoardFilter] = useState<Set<string>>(new Set())

  // Create task flow state
  const [boardPickerOpen, setBoardPickerOpen] = useState(false)
  const [selectedBoardId, setSelectedBoardId] = useState<string>("")
  const [selectedColumnId, setSelectedColumnId] = useState<string>("")
  const [selectedColumnName, setSelectedColumnName] = useState<string>("")
  const [createTaskOpen, setCreateTaskOpen] = useState(false)

  // Use URL as the source of truth for selected task
  const selectedTaskId = taskIdFromUrl ?? null

  // Update URL when task is selected/deselected
  const handleTaskSelect = (taskId: string | null) => {
    navigate({
      to: "/tasks",
      search: taskId ? { taskId } : {},
      replace: true,
    })
  }

  // Fetch current user info
  const { data: userData } = useQuery({
    queryKey: ["auth", "me"],
    queryFn: async () => {
      const response = await api.auth.me.$get()
      if (!response.ok) {
        throw new Error("Failed to fetch user")
      }
      return response.json()
    },
  })

  const currentUserId = userData?.user?.id

  // Fetch all boards in the workspace
  const { data: boards = [], isLoading: boardsLoading } = useQuery<Board[]>({
    queryKey: ["boards"],
    queryFn: async () => {
      const response = await api.boards.$get()
      if (!response.ok) {
        throw new Error("Failed to fetch boards")
      }
      return response.json()
    },
  })

  // Fetch board members for create task dialog
  const { data: createBoardMembersData } = useQuery({
    queryKey: ["board-members", selectedBoardId],
    queryFn: async () => {
      const response = await api.boards[":id"].members.$get({
        param: { id: selectedBoardId },
      })
      if (!response.ok) return { members: [] }
      return response.json()
    },
    enabled: !!selectedBoardId,
  })

  const createBoardMembers = (createBoardMembersData?.members || []).map((member: { userId: string; user: { email: string; firstName: string | null; lastName: string | null; imageUrl: string | null }; role: string }) => ({
    userId: member.userId,
    email: member.user.email,
    firstName: member.user.firstName,
    lastName: member.user.lastName,
    imageUrl: member.user.imageUrl,
    role: member.role,
  }))

  // Fetch board detail with columns for create task dialog
  const { data: selectedBoardDetail } = useQuery<BoardWithColumns>({
    queryKey: ["board", selectedBoardId],
    queryFn: async () => {
      const response = await api.boards[":id"].$get({
        param: { id: selectedBoardId },
      })
      if (!response.ok) {
        throw new Error("Failed to fetch board")
      }
      return response.json()
    },
    enabled: !!selectedBoardId,
  })

  // Fetch tasks assigned to current user from all boards
  const { data: allTasks = [], isLoading: tasksLoading } = useQuery<TaskWithBoard[]>({
    queryKey: ["my-tasks", currentUserId, boards.map((b: Board) => b.id)],
    queryFn: async (): Promise<TaskWithBoard[]> => {
      if (!currentUserId) return []
      // Fetch tasks assigned to current user from all boards in parallel
      const tasksPromises = boards.map(async (board: Board) => {
        try {
          const response = await api.tasks.$get({
            query: { boardId: board.id, assigneeId: currentUserId },
          })
          if (!response.ok) {
            console.warn(`Failed to fetch tasks for board ${board.id} (${board.name})`)
            return []
          }
          const tasksData = await response.json()
          return tasksData.map((task): TaskWithBoard => ({
            ...task,
            boardName: board.name,
            boardColor: board.color,
          }))
        } catch (error) {
          console.error(`Error fetching tasks for board ${board.id}:`, error)
          return []
        }
      })

      const tasksArrays = await Promise.all(tasksPromises)
      return tasksArrays.flat()
    },
    enabled: boards.length > 0 && !!currentUserId,
  })

  // Get the board for a selected task
  const selectedTask = allTasks.find((t) => t.id === selectedTaskId)
  const selectedTaskBoardId = selectedTask?.boardId

  // Fetch board members for the selected task's board (for assignment)
  const { data: boardMembersData } = useQuery({
    queryKey: ["board-members", selectedTaskBoardId],
    queryFn: async () => {
      const response = await api.boards[":id"].members.$get({
        param: { id: selectedTaskBoardId! },
      })
      if (!response.ok) return { members: [] }
      return response.json()
    },
    enabled: !!selectedTaskBoardId,
  })

  const boardMembersForTask = (boardMembersData?.members || []).map((member: { userId: string; user: { email: string; firstName: string | null; lastName: string | null; imageUrl: string | null }; role: string }) => ({
    userId: member.userId,
    email: member.user.email,
    firstName: member.user.firstName,
    lastName: member.user.lastName,
    imageUrl: member.user.imageUrl,
  }))

  // Filter tasks based on active tab and search
  const filteredTasks = useMemo((): TaskWithBoard[] => {
    const now = new Date()
    const soonThreshold = addDays(now, 7)

    let filtered = allTasks.filter(
      (task: TaskWithBoard) => !task.archivedAt && !task.deletedAt
    )

    // Tab filters
    switch (activeTab) {
      case "due-soon":
        filtered = filtered.filter((task: TaskWithBoard) => {
          if (!task.dueDate) return false
          const dueDate = new Date(task.dueDate)
          return isBefore(dueDate, soonThreshold) && !isBefore(dueDate, now)
        })
        break
      case "overdue":
        filtered = filtered.filter((task: TaskWithBoard) => {
          if (!task.dueDate) return false
          const dueDate = new Date(task.dueDate)
          return isBefore(dueDate, now) && !task.completedAt
        })
        break
      case "completed":
        filtered = filtered.filter((task: TaskWithBoard) => !!task.completedAt)
        break
      case "all":
      default:
        // Show non-completed tasks
        filtered = filtered.filter((task: TaskWithBoard) => !task.completedAt)
        break
    }

    // Search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase()
      filtered = filtered.filter(
        (task: TaskWithBoard) =>
          task.title.toLowerCase().includes(query) ||
          task.description?.toLowerCase().includes(query)
      )
    }

    // Priority filter
    if (priorityFilter.size > 0) {
      filtered = filtered.filter((task: TaskWithBoard) =>
        task.priority ? priorityFilter.has(task.priority) : false
      )
    }

    // Board filter
    if (boardFilter.size > 0) {
      filtered = filtered.filter((task: TaskWithBoard) =>
        boardFilter.has(task.boardId)
      )
    }

    // Sort by due date (earliest first), then by created date
    filtered.sort((a: TaskWithBoard, b: TaskWithBoard) => {
      if (a.dueDate && b.dueDate) {
        return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime()
      }
      if (a.dueDate) return -1
      if (b.dueDate) return 1
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    })

    return filtered
  }, [allTasks, activeTab, searchQuery, priorityFilter, boardFilter])

  const tabs = [
    { id: "all" as const, label: "Active" },
    { id: "due-soon" as const, label: "Due Soon" },
    { id: "overdue" as const, label: "Overdue" },
    { id: "completed" as const, label: "Completed" },
  ]

  const isLoading = boardsLoading || tasksLoading

  return (
    <div className="h-full flex flex-col animate-in fade-in duration-500 -m-6">
      {/* Header section */}
      <div className="bg-background border-b border-border px-8 py-4 shrink-0 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Tasks</h1>
          </div>
          <Button
            className="bg-primary hover:bg-primary/90 text-primary-foreground shadow-sm"
            onClick={() => {
              setSelectedBoardId("")
              setSelectedColumnId("")
              setSelectedColumnName("")
              setBoardPickerOpen(true)
            }}
          >
            <Plus className="mr-2 h-4 w-4" />
            Create Task
          </Button>
        </div>

        <div className="flex items-center gap-6 border-b border-transparent">
          {tabs.map((tab) => (
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
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className={`h-9 border-dashed ${priorityFilter.size > 0 ? "border-primary text-primary" : ""}`}>
                  <Flag className="mr-2 h-3.5 w-3.5" />
                  Priority
                  {priorityFilter.size > 0 && (
                    <span className="ml-1.5 rounded-full bg-primary text-primary-foreground text-xs px-1.5 py-0.5 leading-none">
                      {priorityFilter.size}
                    </span>
                  )}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-40">
                <DropdownMenuLabel>Priority</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {(["low", "medium", "high"] as const).map((priority) => (
                  <DropdownMenuCheckboxItem
                    key={priority}
                    checked={priorityFilter.has(priority)}
                    onCheckedChange={(checked) => {
                      setPriorityFilter((prev) => {
                        const next = new Set(prev)
                        if (checked) next.add(priority)
                        else next.delete(priority)
                        return next
                      })
                    }}
                    onSelect={(e) => e.preventDefault()}
                  >
                    {priority.charAt(0).toUpperCase() + priority.slice(1)}
                  </DropdownMenuCheckboxItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className={`h-9 border-dashed ${boardFilter.size > 0 ? "border-primary text-primary" : ""}`}>
                  <Calendar className="mr-2 h-3.5 w-3.5" />
                  Board
                  {boardFilter.size > 0 && (
                    <span className="ml-1.5 rounded-full bg-primary text-primary-foreground text-xs px-1.5 py-0.5 leading-none">
                      {boardFilter.size}
                    </span>
                  )}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-52">
                <DropdownMenuLabel>Board</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {boards.map((board) => (
                  <DropdownMenuCheckboxItem
                    key={board.id}
                    checked={boardFilter.has(board.id)}
                    onCheckedChange={(checked) => {
                      setBoardFilter((prev) => {
                        const next = new Set(prev)
                        if (checked) next.add(board.id)
                        else next.delete(board.id)
                        return next
                      })
                    }}
                    onSelect={(e) => e.preventDefault()}
                  >
                    <span className="flex items-center gap-2">
                      <span
                        className="w-2 h-2 rounded-full shrink-0"
                        style={{ backgroundColor: board.color || "#64748b" }}
                      />
                      <span className="truncate">{board.name}</span>
                    </span>
                  </DropdownMenuCheckboxItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>

            {(priorityFilter.size > 0 || boardFilter.size > 0) && (
              <Button
                variant="ghost"
                className="h-9 text-muted-foreground hover:text-foreground text-sm"
                onClick={() => {
                  setPriorityFilter(new Set())
                  setBoardFilter(new Set())
                }}
              >
                <X className="mr-1 h-3.5 w-3.5" />
                Clear filters
              </Button>
            )}
            {searchQuery && (
              <Button
                variant="ghost"
                className="h-9 text-muted-foreground hover:text-foreground text-sm"
                onClick={() => setSearchQuery("")}
              >
                Clear Search
              </Button>
            )}
          </div>

          <div className="flex items-center gap-2">
            <div className="relative w-64">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search tasks..."
                className="pl-9 h-9"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <span className="text-sm text-muted-foreground mx-2">
              {filteredTasks.length} task{filteredTasks.length !== 1 ? "s" : ""}
            </span>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 min-h-0 flex bg-muted/10">
        {/* Task List */}
        <div
          className={`flex-1 overflow-y-auto p-6 transition-all duration-300 ${selectedTaskId ? "pr-2" : ""}`}
        >
          {isLoading ? (
            <div className="flex items-center justify-center h-64">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : filteredTasks.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 gap-4">
              <p className="text-muted-foreground">No tasks found</p>
              {searchQuery && (
                <Button variant="outline" onClick={() => setSearchQuery("")}>
                  Clear search
                </Button>
              )}
            </div>
          ) : (
            <>
              <div className="rounded-lg border bg-background shadow-sm overflow-hidden">
                {/* List Header */}
                <div className="grid grid-cols-[30px_2fr_120px_120px_140px_80px] gap-4 px-6 py-3 text-xs font-semibold text-muted-foreground bg-muted/5 border-b border-border items-center">
                  <div className="flex items-center justify-center">
                    <div className="h-4 w-4 rounded border border-input" />
                  </div>
                  <div>TASK TITLE</div>
                  <div className={`${selectedTaskId ? "hidden xl:block" : ""}`}>BOARD</div>
                  <div className={`${selectedTaskId ? "hidden" : "block"}`}>STATUS</div>
                  <div className={`${selectedTaskId ? "hidden md:block" : ""}`}>DUE DATE</div>
                  <div className={`${selectedTaskId ? "hidden lg:block" : ""}`}>PRIORITY</div>
                </div>

                {/* Rows */}
                <div className="divide-y divide-border">
                  {filteredTasks.map((task: TaskWithBoard) => (
                    <TaskRow
                      key={task.id}
                      task={task}
                      isSelected={task.id === selectedTaskId}
                      onSelect={() => handleTaskSelect(task.id === selectedTaskId ? null : task.id)}
                      hideColumns={!!selectedTaskId}
                    />
                  ))}
                </div>
              </div>

              {/* Pagination placeholder */}
              <div className="mt-4 flex items-center justify-between px-2">
                <span className="text-sm text-muted-foreground">
                  Showing {filteredTasks.length} task{filteredTasks.length !== 1 ? "s" : ""}
                </span>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Task Detail Panel */}
      {selectedTaskId && selectedTaskBoardId && (
        <TaskDetailPanel
          taskId={selectedTaskId}
          boardId={selectedTaskBoardId}
          onClose={() => handleTaskSelect(null)}
          workspaceMembers={boardMembersForTask}
        />
      )}

      {/* Board/Column Picker Dialog */}
      <Dialog open={boardPickerOpen} onOpenChange={setBoardPickerOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Create Task</DialogTitle>
            <DialogDescription>
              Select a board and column for the new task.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {boardsLoading ? (
              <div className="flex items-center justify-center py-4">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : boards.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">
                No boards available. Create a board first to add tasks.
              </p>
            ) : (
            <>
            <div className="space-y-2">
              <Label>Board</Label>
              <Select
                value={selectedBoardId}
                onValueChange={(value) => {
                  setSelectedBoardId(value)
                  setSelectedColumnId("")
                  setSelectedColumnName("")
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a board" />
                </SelectTrigger>
                <SelectContent>
                  {boards.map((board) => (
                    <SelectItem key={board.id} value={board.id}>
                      <span className="flex items-center gap-2">
                        <span
                          className="w-2 h-2 rounded-full shrink-0"
                          style={{ backgroundColor: board.color || "#64748b" }}
                        />
                        {board.name}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {selectedBoardDetail && (
              <div className="space-y-2">
                <Label>Column</Label>
                <Select
                  value={selectedColumnId}
                  onValueChange={(value) => {
                    setSelectedColumnId(value)
                    const col = selectedBoardDetail.columns.find((c) => c.id === value)
                    setSelectedColumnName(col?.name ?? "")
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select a column" />
                  </SelectTrigger>
                  <SelectContent>
                    {selectedBoardDetail.columns
                      .slice()
                      .sort((a, b) => a.position - b.position)
                      .map((col) => (
                        <SelectItem key={col.id} value={col.id}>
                          {col.name}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setBoardPickerOpen(false)}>
                Cancel
              </Button>
              <Button
                disabled={!selectedBoardId || !selectedColumnId}
                onClick={() => {
                  setBoardPickerOpen(false)
                  setCreateTaskOpen(true)
                }}
              >
                Continue
              </Button>
            </div>
            </>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Create Task Dialog */}
      {selectedBoardId && selectedColumnId && (
        <CreateTaskDialog
          open={createTaskOpen}
          onOpenChange={setCreateTaskOpen}
          boardId={selectedBoardId}
          columnId={selectedColumnId}
          columnName={selectedColumnName}
          workspaceMembers={createBoardMembers}
        />
      )}
    </div>
  )
}

function TaskRow({
  task,
  isSelected,
  onSelect,
  hideColumns,
}: {
  task: TaskWithBoard
  isSelected: boolean
  onSelect: () => void
  hideColumns: boolean
}) {
  const now = new Date()
  const isOverdue = task.dueDate && isBefore(new Date(task.dueDate), now) && !task.completedAt

  return (
    <div
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault()
          onSelect()
        }
      }}
      role="button"
      tabIndex={0}
      className={`grid grid-cols-[30px_2fr_120px_120px_140px_80px] gap-4 px-6 py-4 items-center cursor-pointer transition-colors hover:bg-muted/50 focus:outline-none focus:ring-2 focus:ring-primary/20 ${
        isSelected ? "bg-primary/5 hover:bg-primary/10" : ""
      }`}
    >
      <div className="flex items-center justify-center">
        {task.completedAt ? (
          <div className="h-4 w-4 rounded-full bg-emerald-500 flex items-center justify-center">
            <svg className="h-2.5 w-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>
        ) : (
          <div className="h-4 w-4 rounded-full border-2 border-muted-foreground/30" />
        )}
      </div>
      <div className="flex items-center gap-3 overflow-hidden">
        <div
          className={`min-w-0 font-medium text-sm truncate ${
            task.completedAt ? "text-muted-foreground line-through" : "text-foreground"
          }`}
        >
          {task.title}
        </div>
      </div>
      <div className={`${hideColumns ? "hidden xl:block" : ""}`}>
        <BoardBadge name={task.boardName} color={task.boardColor} />
      </div>
      <div className={`${hideColumns ? "hidden" : "block"}`}>
        <StatusBadge completedAt={task.completedAt} />
      </div>
      <div
        className={`text-sm text-muted-foreground flex items-center gap-2 ${
          hideColumns ? "hidden md:flex" : ""
        }`}
      >
        {task.dueDate ? (
          <>
            {isOverdue ? (
              <AlertCircleIcon className="h-4 w-4 text-rose-500" />
            ) : (
              <Calendar className="h-4 w-4 text-slate-400" />
            )}
            <span className={isOverdue ? "text-rose-600 font-medium" : ""}>
              {format(new Date(task.dueDate), "MMM d, yyyy")}
            </span>
          </>
        ) : (
          <span className="text-muted-foreground/50">No due date</span>
        )}
      </div>
      <div className={`${hideColumns ? "hidden lg:block" : ""}`}>
        <PriorityBadge priority={task.priority} />
      </div>
    </div>
  )
}

function TabButton({
  children,
  active,
  onClick,
}: {
  children: React.ReactNode
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={`px-1 py-1 text-sm font-medium border-b-2 transition-all whitespace-nowrap ${
        active
          ? "border-primary text-primary"
          : "border-transparent text-muted-foreground hover:text-foreground"
      }`}
    >
      {children}
    </button>
  )
}

function StatusBadge({ completedAt }: { completedAt: string | null }) {
  const isDone = !!completedAt

  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded text-xs font-medium ${
        isDone ? "bg-emerald-100 text-emerald-700" : "bg-muted text-foreground"
      }`}
    >
      {isDone ? "Done" : "Active"}
    </span>
  )
}

function BoardBadge({ name, color }: { name: string; color?: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-700">
      <span
        className="w-1.5 h-1.5 rounded-full"
        style={{ backgroundColor: color || "#64748b" }}
      />
      {name}
    </span>
  )
}

function AlertCircleIcon(props: React.SVGProps<SVGSVGElement>) {
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
