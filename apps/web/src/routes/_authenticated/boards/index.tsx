import { createFileRoute, Link } from "@tanstack/react-router"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useState } from "react"
import { Card } from "@tracky/web/components/ui/card"
import { Button } from "@tracky/web/components/ui/button"
import { Input } from "@tracky/web/components/ui/input"
import { Label } from "@tracky/web/components/ui/label"

import { Avatar, AvatarFallback, AvatarImage } from "@tracky/web/components/ui/avatar"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@tracky/web/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@tracky/web/components/ui/select"
import {
  Plus,
  Search,
  LayoutGrid,
  List,
  Loader2,
  Kanban,
  Settings2,
  Clock,
  CircleDot,
  CircleAlert,
  CircleCheck,
} from "lucide-react"
import { useApi } from "@tracky/web/hooks/use-api"

export const Route = createFileRoute("/_authenticated/boards/")({
  component: BoardsList,
})

function useAuthData() {
  const api = useApi()
  const { data } = useQuery({
    queryKey: ["auth", "me"],
    queryFn: async () => {
      const response = await api.auth.me.$get()
      if (!response.ok) {
        throw new Error("Failed to fetch user")
      }
      return response.json()
    },
  })
  return data
}

function useIsAdmin() {
  const data = useAuthData()
  const role = data?.user?.role
  return role === "workspace_admin"
}

// Board colors for visual variety
const BOARD_COLORS = [
  { value: "#3B82F6", name: "Blue" },
  { value: "#8B5CF6", name: "Purple" },
  { value: "#10B981", name: "Green" },
  { value: "#F59E0B", name: "Orange" },
  { value: "#EC4899", name: "Pink" },
  { value: "#EF4444", name: "Red" },
]

const MAX_VISIBLE_AVATARS = 3

function BoardMemberAvatars({ boardId }: { boardId: string }) {
  const api = useApi()
  const { data } = useQuery({
    queryKey: ["board-members", boardId],
    queryFn: async () => {
      const response = await api.boards[":id"].members.$get({
        param: { id: boardId },
      })
      if (!response.ok) throw new Error("Failed to fetch board members")
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
        <Avatar key={member.id} className="h-7 w-7 border-2 border-white">
          <AvatarImage src={member.user.imageUrl || undefined} />
          <AvatarFallback className="text-xs">{getInitials(member)}</AvatarFallback>
        </Avatar>
      ))}
      {overflow > 0 && (
        <div className="h-7 w-7 rounded-full bg-gray-100 border-2 border-white flex items-center justify-center">
          <span className="text-xs text-gray-600 font-medium">+{overflow}</span>
        </div>
      )}
    </div>
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

function BoardCard({ board }: { board: { id: string; name: string; description: string | null; color: string; createdAt: string; updatedAt: string } }) {
  return (
    <Link to="/boards/$boardId" params={{ boardId: board.id }} className="block group">
      <Card className="h-full hover:shadow-lg transition-all duration-300 overflow-hidden bg-white pt-0">
        {/* Full-width colored bar at top */}
        <div
          className="h-1.5 w-full"
          style={{ backgroundColor: board.color }}
        />

        <div className="p-5">
          <div className="flex gap-5">
            {/* Left column: title, description, members */}
            <div className="flex flex-col justify-between min-w-0 flex-1">
              <div>
                <h3 className="text-lg font-bold text-gray-900 mb-2 group-hover:text-primary transition-colors truncate">
                  {board.name}
                </h3>
                <p className="text-sm text-gray-500 mb-3 line-clamp-2">
                  {board.description || "No description"}
                </p>
              </div>
              <BoardMemberAvatars boardId={board.id} />
            </div>

            {/* Divider */}
            <div className="w-px bg-border/60 self-stretch" />

            {/* Right column: task stats */}
            <BoardTaskStats boardId={board.id} />
          </div>
        </div>
      </Card>
    </Link>
  )
}

const PLAN_BOARD_LIMITS = { free: 5, pro: Infinity } as const

function BoardsList() {
  const api = useApi()
  const queryClient = useQueryClient()
  const isAdmin = useIsAdmin()
  const authData = useAuthData()
  const plan = (authData?.workspace?.plan ?? "free") as "free" | "pro"
  const maxBoards = PLAN_BOARD_LIMITS[plan]
  const [searchQuery, setSearchQuery] = useState("")
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid")
  const [sortOrder, setSortOrder] = useState<"manual" | "name" | "updated">("manual")
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [newBoardName, setNewBoardName] = useState("")
  const [newBoardDescription, setNewBoardDescription] = useState("")
  const [newBoardColor, setNewBoardColor] = useState(BOARD_COLORS[0].value)

  // Fetch boards
  const { data: boards, isLoading, error } = useQuery({
    queryKey: ["boards"],
    queryFn: async () => {
      const response = await api.boards.$get()
      if (!response.ok) {
        throw new Error("Failed to fetch boards")
      }
      return response.json()
    },
  })

  // Create board mutation
  const createBoard = useMutation({
    mutationFn: async (data: { name: string; description?: string; color?: string }) => {
      const response = await api.boards.$post({
        json: data,
      })
      if (!response.ok) {
        const error = await response.json()
        throw new Error((error as { message?: string }).message || "Failed to create board")
      }
      return response.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["boards"] })
      setIsCreateOpen(false)
      setNewBoardName("")
      setNewBoardDescription("")
      setNewBoardColor(BOARD_COLORS[0].value)
    },
  })

  // Filter and sort boards
  const filteredBoards = boards
    ?.filter((board) => {
      const matchesSearch =
        board.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        board.description?.toLowerCase().includes(searchQuery.toLowerCase())
      return matchesSearch
    })
    .sort((a, b) => {
      if (sortOrder === "name") return a.name.localeCompare(b.name)
      if (sortOrder === "updated")
        return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
      return 0 // manual order (default position)
    })

  const handleCreateBoard = (e: React.FormEvent) => {
    e.preventDefault()
    if (!newBoardName.trim()) return
    createBoard.mutate({
      name: newBoardName,
      description: newBoardDescription || undefined,
      color: newBoardColor,
    })
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4">
        <p className="text-destructive">Failed to load boards</p>
        <Button onClick={() => queryClient.invalidateQueries({ queryKey: ["boards"] })}>
          Try Again
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-6 h-full flex flex-col animate-in fade-in duration-500">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="space-y-1">
          <h1 className="text-3xl font-bold tracking-tight">Boards</h1>
          <p className="text-muted-foreground">Manage boards in this workspace</p>
        </div>
        {isAdmin && <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogTrigger asChild>
            <Button className="bg-teal-600 hover:bg-teal-700">
              <Plus className="mr-2 h-4 w-4" />
              New Board
            </Button>
          </DialogTrigger>
          <DialogContent>
            <form onSubmit={handleCreateBoard}>
              <DialogHeader>
                <DialogTitle>Create New Board</DialogTitle>
                <DialogDescription>
                  Create a new board to organize your tasks.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Board Name</Label>
                  <Input
                    id="name"
                    placeholder="e.g., Product Roadmap"
                    value={newBoardName}
                    onChange={(e) => setNewBoardName(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="description">Description (optional)</Label>
                  <Input
                    id="description"
                    placeholder="What's this board for?"
                    value={newBoardDescription}
                    onChange={(e) => setNewBoardDescription(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Color</Label>
                  <div className="flex gap-2">
                    {BOARD_COLORS.map((color) => (
                      <button
                        key={color.value}
                        type="button"
                        className={`h-8 w-8 rounded-full border-2 transition-all ${
                          newBoardColor === color.value
                            ? "border-foreground scale-110"
                            : "border-transparent"
                        }`}
                        style={{ backgroundColor: color.value }}
                        onClick={() => setNewBoardColor(color.value)}
                        title={color.name}
                      />
                    ))}
                  </div>
                </div>
                {createBoard.error && (
                  <p className="text-sm text-destructive">
                    {createBoard.error instanceof Error
                      ? createBoard.error.message
                      : "Failed to create board"}
                  </p>
                )}
              </div>
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsCreateOpen(false)}
                  disabled={createBoard.isPending}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={createBoard.isPending || !newBoardName.trim()}>
                  {createBoard.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Create Board
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>}
      </div>

      {/* Board count and view toggle */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          You have <span className="font-medium text-foreground">{boards?.length || 0}</span>{maxBoards !== Infinity ? `/${maxBoards}` : ""} boards
        </p>
        <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1">
          <Button
            variant="ghost"
            size="icon"
            className={`h-8 w-8 ${viewMode === "grid" ? "bg-white shadow-sm" : ""}`}
            onClick={() => setViewMode("grid")}
          >
            <LayoutGrid className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className={`h-8 w-8 ${viewMode === "list" ? "bg-white shadow-sm" : ""}`}
            onClick={() => setViewMode("list")}
          >
            <List className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Search and filters */}
      <div className="flex items-center gap-4">
        {/* Search */}
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search boards..."
            className="pl-9 bg-white"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        <div className="flex-1" />

        {/* Sort */}
        <Select
          value={sortOrder}
          onValueChange={(value: "manual" | "name" | "updated") => setSortOrder(value)}
        >
          <SelectTrigger className="w-36 bg-white">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="manual">Manual Order</SelectItem>
            <SelectItem value="name">Name</SelectItem>
            <SelectItem value="updated">Last Updated</SelectItem>
          </SelectContent>
        </Select>

        <Button variant="ghost" size="icon" className="h-9 w-9 text-gray-400 hover:text-gray-600">
          <Settings2 className="h-4 w-4" />
        </Button>
      </div>

      {/* Board grid/list */}
      {filteredBoards && filteredBoards.length > 0 ? (
        <div
          className={
            viewMode === "grid"
              ? "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
              : "flex flex-col gap-4"
          }
        >
          {filteredBoards.map((board) => (
            <BoardCard
              key={board.id}
              board={board}
            />
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center h-64 gap-4">
          <Kanban className="h-16 w-16 text-muted-foreground/50" />
          <div className="text-center">
            <h3 className="text-lg font-semibold">No boards yet</h3>
            <p className="text-muted-foreground">
              {isAdmin
                ? "Create your first board to get started organizing tasks."
                : "No boards have been created yet. Ask an admin to create one."}
            </p>
          </div>
          {isAdmin && (
            <Button onClick={() => setIsCreateOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Create Your First Board
            </Button>
          )}
        </div>
      )}
    </div>
  )
}
