import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import { useApi } from "./use-api"

// Task assignee with user details (from list endpoint)
export type TaskAssigneeWithUser = {
  id: string
  userId: string
  assignedAt: string
  user: {
    firstName: string | null
    lastName: string | null
    email: string
    imageUrl: string | null
  }
}

// Task type inferred from API response (dates come as ISO strings from API)
export type Task = {
  id: string
  workspaceId: string
  boardId: string
  columnId: string
  title: string
  description: string | null
  priority: "low" | "medium" | "high"
  dueDate: string | null
  position: number
  createdById: string
  completedAt: string | null
  archivedAt: string | null
  createdAt: string
  updatedAt: string
  deletedAt: string | null
  assignees: TaskAssigneeWithUser[]
}

export type TaskAssignee = {
  id: string
  userId: string
  assignedAt: string
}

// Task with simple assignees (without full user details) - used by getTask endpoint
export type TaskWithSimpleAssignees = Omit<Task, "assignees"> & {
  assignees: TaskAssignee[]
}

// Task with board info (for overdue tasks)
export type TaskWithBoard = Task & {
  boardName: string
  boardColor: string
}

// Query keys
export const taskKeys = {
  all: ["tasks"] as const,
  lists: () => [...taskKeys.all, "list"] as const,
  list: (filters: { boardId: string; assigneeId?: string; priority?: string; archived?: boolean }) =>
    [...taskKeys.lists(), filters] as const,
  overdue: (limit?: number) => [...taskKeys.all, "overdue", limit] as const,
  details: () => [...taskKeys.all, "detail"] as const,
  detail: (id: string) => [...taskKeys.details(), id] as const,
}

// Helper to invalidate all task list queries for a specific board
// Uses a predicate to match queries regardless of filter parameters
function invalidateTaskListsForBoard(
  queryClient: ReturnType<typeof useQueryClient>,
  boardId: string
) {
  queryClient.invalidateQueries({
    predicate: (query) =>
      query.queryKey[0] === "tasks" &&
      query.queryKey[1] === "list" &&
      (query.queryKey[2] as { boardId?: string })?.boardId === boardId,
  })
  // Also invalidate the "my-tasks" query used by the Tasks page
  queryClient.invalidateQueries({
    predicate: (query) => query.queryKey[0] === "my-tasks",
  })
}

// Query: Fetch tasks by board
export function useTasksByBoard(
  boardId: string,
  options?: {
    assigneeId?: string
    priority?: "low" | "medium" | "high"
    archived?: boolean
  }
) {
  const api = useApi()

  return useQuery({
    queryKey: taskKeys.list({ boardId, ...options }),
    queryFn: async () => {
      const response = await api.tasks.$get({
        query: {
          boardId,
          assigneeId: options?.assigneeId,
          priority: options?.priority,
          archived: options?.archived?.toString(),
        },
      })
      if (!response.ok) {
        throw new Error("Failed to fetch tasks")
      }
      return response.json()
    },
    enabled: !!boardId,
  })
}

// Query: Fetch single task with assignees
export function useTask(taskId: string) {
  const api = useApi()

  return useQuery({
    queryKey: taskKeys.detail(taskId),
    queryFn: async () => {
      const response = await api.tasks[":id"].$get({
        param: { id: taskId },
      })
      if (!response.ok) {
        throw new Error("Failed to fetch task")
      }
      return response.json()
    },
    enabled: !!taskId,
  })
}

// Query: Fetch overdue tasks across workspace
export function useOverdueTasks(limit: number = 10) {
  const api = useApi()

  return useQuery({
    queryKey: taskKeys.overdue(limit),
    queryFn: async (): Promise<TaskWithBoard[]> => {
      const response = await api.tasks.overdue.$get({
        query: { limit: limit.toString() },
      })
      if (!response.ok) {
        throw new Error("Failed to fetch overdue tasks")
      }
      return response.json() as Promise<TaskWithBoard[]>
    },
  })
}

// Mutation: Create task
export function useCreateTask() {
  const api = useApi()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (data: {
      boardId: string
      columnId: string
      title: string
      description?: string
      priority?: "low" | "medium" | "high"
      dueDate?: Date
    }) => {
      const response = await api.tasks.$post({
        json: data,
      })
      if (!response.ok) {
        const error = await response.json()
        throw new Error((error as { message?: string }).message || "Failed to create task")
      }
      return response.json()
    },
    onSuccess: (_, variables) => {
      invalidateTaskListsForBoard(queryClient, variables.boardId)
    },
  })
}

// Mutation: Update task
export function useUpdateTask() {
  const api = useApi()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      taskId,
      data,
    }: {
      taskId: string
      boardId: string
      data: {
        title?: string
        description?: string | null
        priority?: "low" | "medium" | "high"
        dueDate?: Date | null
      }
    }) => {
      const response = await api.tasks[":id"].$patch({
        param: { id: taskId },
        json: data,
      })
      if (!response.ok) {
        const error = await response.json()
        throw new Error((error as { message?: string }).message || "Failed to update task")
      }
      return response.json()
    },
    onSuccess: (_, variables) => {
      invalidateTaskListsForBoard(queryClient, variables.boardId)
      queryClient.invalidateQueries({
        queryKey: taskKeys.detail(variables.taskId),
      })
    },
  })
}

// Mutation: Delete task
export function useDeleteTask() {
  const api = useApi()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ taskId }: { taskId: string; boardId: string }) => {
      const response = await api.tasks[":id"].$delete({
        param: { id: taskId },
      })
      if (!response.ok) {
        const error = await response.json()
        throw new Error((error as { message?: string }).message || "Failed to delete task")
      }
    },
    onSuccess: (_, variables) => {
      invalidateTaskListsForBoard(queryClient, variables.boardId)
    },
  })
}

// Mutation: Move task between columns
export function useMoveTask() {
  const api = useApi()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      taskId,
      columnId,
      position,
    }: {
      taskId: string
      boardId: string
      columnId: string
      position: number
    }) => {
      const response = await api.tasks[":id"].move.$patch({
        param: { id: taskId },
        json: { columnId, position },
      })
      if (!response.ok) {
        const error = await response.json()
        throw new Error((error as { message?: string }).message || "Failed to move task")
      }
      return response.json()
    },
    onSuccess: (_, variables) => {
      invalidateTaskListsForBoard(queryClient, variables.boardId)
    },
  })
}

// Mutation: Reorder tasks within column
export function useReorderTasks() {
  const api = useApi()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      columnId,
      taskIds,
    }: {
      boardId: string
      columnId: string
      taskIds: string[]
    }) => {
      const response = await api.tasks.reorder.$patch({
        json: { columnId, taskIds },
      })
      if (!response.ok) {
        const error = await response.json()
        throw new Error((error as { message?: string }).message || "Failed to reorder tasks")
      }
      return response.json()
    },
    onSuccess: (_, variables) => {
      invalidateTaskListsForBoard(queryClient, variables.boardId)
    },
  })
}

// Mutation: Archive task
export function useArchiveTask() {
  const api = useApi()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ taskId }: { taskId: string; boardId: string }) => {
      const response = await api.tasks[":id"].archive.$patch({
        param: { id: taskId },
      })
      if (!response.ok) {
        const error = await response.json()
        throw new Error((error as { message?: string }).message || "Failed to archive task")
      }
      return response.json()
    },
    onSuccess: (_, variables) => {
      invalidateTaskListsForBoard(queryClient, variables.boardId)
      queryClient.invalidateQueries({
        queryKey: taskKeys.detail(variables.taskId),
      })
    },
  })
}

// Mutation: Unarchive task
export function useUnarchiveTask() {
  const api = useApi()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ taskId }: { taskId: string; boardId: string }) => {
      const response = await api.tasks[":id"].unarchive.$patch({
        param: { id: taskId },
      })
      if (!response.ok) {
        const error = await response.json()
        throw new Error((error as { message?: string }).message || "Failed to unarchive task")
      }
      return response.json()
    },
    onSuccess: (_, variables) => {
      invalidateTaskListsForBoard(queryClient, variables.boardId)
      queryClient.invalidateQueries({
        queryKey: taskKeys.detail(variables.taskId),
      })
    },
  })
}

// Mutation: Assign user to task
export function useAssignUser() {
  const api = useApi()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      taskId,
      userId,
    }: {
      taskId: string
      userId: string
      boardId?: string
    }) => {
      const response = await api.tasks[":id"].assignees.$post({
        param: { id: taskId },
        json: { userId },
      })
      if (!response.ok) {
        const error = await response.json()
        throw new Error((error as { message?: string }).message || "Failed to assign user")
      }
      return response.json()
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: taskKeys.detail(variables.taskId),
      })
      // Also invalidate the task list if boardId is provided
      if (variables.boardId) {
        invalidateTaskListsForBoard(queryClient, variables.boardId)
      }
    },
  })
}

// Mutation: Unassign user from task
export function useUnassignUser() {
  const api = useApi()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      taskId,
      userId,
    }: {
      taskId: string
      userId: string
      boardId?: string
    }) => {
      const response = await api.tasks[":id"].assignees[":userId"].$delete({
        param: { id: taskId, userId },
      })
      if (!response.ok) {
        const error = await response.json()
        throw new Error((error as { message?: string }).message || "Failed to unassign user")
      }
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: taskKeys.detail(variables.taskId),
      })
      // Also invalidate the task list if boardId is provided
      if (variables.boardId) {
        invalidateTaskListsForBoard(queryClient, variables.boardId)
      }
    },
  })
}
