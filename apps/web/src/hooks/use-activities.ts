import { useQuery } from "@tanstack/react-query"

import { useApi } from "./use-api"

// Activity action types
export type ActivityAction =
  | "task_created"
  | "task_updated"
  | "task_moved"
  | "task_archived"
  | "task_unarchived"
  | "task_deleted"
  | "assignee_added"
  | "assignee_removed"
  | "comment_added"
  | "comment_deleted"
  | "attachment_uploaded"
  | "attachment_deleted"

// Activity user info
export type ActivityUser = {
  firstName: string | null
  lastName: string | null
  email: string
  imageUrl: string | null
}

// Activity with details (from list endpoints)
export type Activity = {
  id: string
  workspaceId: string
  boardId: string | null
  taskId: string | null
  userId: string
  action: ActivityAction
  metadata: Record<string, unknown> | null
  createdAt: string
  user: ActivityUser
  boardName: string | null
  taskTitle: string | null
}

// Type assertion helper for API responses
type ApiActivity = Omit<Activity, "metadata"> & {
  metadata: string | number | boolean | unknown[] | Record<string, unknown> | null
}

function normalizeActivity(activity: ApiActivity): Activity {
  return {
    ...activity,
    metadata:
      activity.metadata && typeof activity.metadata === "object" && !Array.isArray(activity.metadata)
        ? (activity.metadata as Record<string, unknown>)
        : null,
  }
}

// Query keys
export const activityKeys = {
  all: ["activities"] as const,
  byTask: (taskId: string) => [...activityKeys.all, "task", taskId] as const,
  byWorkspace: (filters?: {
    boardId?: string
    action?: ActivityAction
    limit?: number
    offset?: number
  }) => [...activityKeys.all, "workspace", filters] as const,
}

// Query: Fetch activities for a specific task
export function useTaskActivities(taskId: string) {
  const api = useApi()

  return useQuery({
    queryKey: activityKeys.byTask(taskId),
    queryFn: async (): Promise<Activity[]> => {
      const response = await api.tasks[":taskId"].activities.$get({
        param: { taskId },
      })
      if (!response.ok) {
        throw new Error("Failed to fetch activities")
      }
      const data = await response.json()
      return (data as ApiActivity[]).map(normalizeActivity)
    },
    enabled: !!taskId,
  })
}

// Query: Fetch workspace activities (with optional filters)
export function useWorkspaceActivities(options?: {
  boardId?: string
  action?: ActivityAction
  limit?: number
  offset?: number
}) {
  const api = useApi()

  return useQuery({
    queryKey: activityKeys.byWorkspace(options),
    queryFn: async () => {
      const response = await api.activities.$get({
        query: {
          boardId: options?.boardId,
          action: options?.action,
          limit: options?.limit?.toString(),
          offset: options?.offset?.toString(),
        },
      })
      if (!response.ok) {
        throw new Error("Failed to fetch activities")
      }
      return response.json()
    },
  })
}
