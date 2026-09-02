import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import { useApi } from "./use-api"

// Notification types from API
export type NotificationType = "mention" | "assignment" | "due_date" | "task_overdue"
export type ResourceType = "task" | "board" | "comment"

export type Notification = {
  id: string
  userId: string
  workspaceId: string | null
  type: NotificationType
  title: string
  body: string | null
  resourceType: ResourceType | null
  resourceId: string | null
  isRead: boolean
  createdAt: string
}

// Query keys
export const notificationKeys = {
  all: ["notifications"] as const,
  lists: () => [...notificationKeys.all, "list"] as const,
  list: (filters?: { limit?: number; offset?: number }) =>
    [...notificationKeys.lists(), filters] as const,
  unreadCount: () => [...notificationKeys.all, "unreadCount"] as const,
}

// Query: Fetch notifications with pagination
export function useNotifications(options?: { limit?: number; offset?: number }) {
  const api = useApi()

  return useQuery({
    queryKey: notificationKeys.list(options),
    queryFn: async () => {
      const response = await api.notifications.$get({
        query: {
          limit: options?.limit?.toString(),
          offset: options?.offset?.toString(),
        },
      })
      if (!response.ok) {
        throw new Error("Failed to fetch notifications")
      }
      return response.json()
    },
  })
}

// Query: Fetch unread notification count
export function useUnreadCount() {
  const api = useApi()

  return useQuery({
    queryKey: notificationKeys.unreadCount(),
    queryFn: async () => {
      const response = await api.notifications["unread-count"].$get()
      if (!response.ok) {
        throw new Error("Failed to fetch unread count")
      }
      return response.json()
    },
    refetchInterval: 30000, // Refetch every 30 seconds
  })
}

// Mutation: Mark single notification as read
export function useMarkNotificationRead() {
  const api = useApi()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (notificationId: string) => {
      const response = await api.notifications[":id"].read.$patch({
        param: { id: notificationId },
      })
      if (!response.ok) {
        const error = await response.json()
        throw new Error((error as { message?: string }).message || "Failed to mark as read")
      }
      return response.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: notificationKeys.all,
      })
    },
  })
}

// Mutation: Mark all notifications as read
export function useMarkAllNotificationsRead() {
  const api = useApi()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async () => {
      const response = await api.notifications["mark-all-read"].$post()
      if (!response.ok) {
        const error = await response.json()
        throw new Error((error as { message?: string }).message || "Failed to mark all as read")
      }
      return response.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: notificationKeys.all,
      })
    },
  })
}
