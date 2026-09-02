import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import { useApi } from "./use-api"
import { activityKeys } from "./use-activities"

// Comment with user and mentions (from list endpoint)
export type CommentUser = {
  firstName: string | null
  lastName: string | null
  email: string
  imageUrl: string | null
}

export type CommentMention = {
  id: string
  userId: string
  createdAt: string
  user: CommentUser
}

export type Comment = {
  id: string
  taskId: string
  userId: string
  content: string
  createdAt: string
  updatedAt: string
  deletedAt: string | null
  user: CommentUser
  mentions: CommentMention[]
}

// Query keys
export const commentKeys = {
  all: ["comments"] as const,
  byTask: (taskId: string) => [...commentKeys.all, "task", taskId] as const,
}

// Query: Fetch comments for a task
export function useComments(taskId: string) {
  const api = useApi()

  return useQuery({
    queryKey: commentKeys.byTask(taskId),
    queryFn: async () => {
      const response = await api.tasks[":taskId"].comments.$get({
        param: { taskId },
      })
      if (!response.ok) {
        throw new Error("Failed to fetch comments")
      }
      return response.json()
    },
    enabled: !!taskId,
  })
}

// Mutation: Create comment
export function useCreateComment() {
  const api = useApi()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      taskId,
      content,
    }: {
      taskId: string
      content: string
    }) => {
      const response = await api.tasks[":taskId"].comments.$post({
        param: { taskId },
        json: { content },
      })
      if (!response.ok) {
        const error = await response.json()
        throw new Error((error as { message?: string }).message || "Failed to create comment")
      }
      return response.json()
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: commentKeys.byTask(variables.taskId),
      })
      // Also invalidate activity feed since adding a comment creates an activity
      queryClient.invalidateQueries({
        queryKey: activityKeys.byTask(variables.taskId),
      })
    },
  })
}

// Mutation: Update comment
export function useUpdateComment() {
  const api = useApi()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      commentId,
      content,
    }: {
      commentId: string
      taskId: string
      content: string
    }) => {
      const response = await api.comments[":id"].$patch({
        param: { id: commentId },
        json: { content },
      })
      if (!response.ok) {
        const error = await response.json()
        throw new Error((error as { message?: string }).message || "Failed to update comment")
      }
      return response.json()
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: commentKeys.byTask(variables.taskId),
      })
    },
  })
}

// Mutation: Delete comment (soft delete)
export function useDeleteComment() {
  const api = useApi()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      commentId,
    }: {
      commentId: string
      taskId: string
    }) => {
      const response = await api.comments[":id"].$delete({
        param: { id: commentId },
      })
      if (!response.ok) {
        const error = await response.json()
        throw new Error((error as { message?: string }).message || "Failed to delete comment")
      }
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: commentKeys.byTask(variables.taskId),
      })
      // Also invalidate activity feed since deleting a comment creates an activity
      queryClient.invalidateQueries({
        queryKey: activityKeys.byTask(variables.taskId),
      })
    },
  })
}
