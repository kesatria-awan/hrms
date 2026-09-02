import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import { useApi } from "@tracky/web/hooks/use-api"

export const announcementKeys = {
  all: ["announcements"] as const,
}

export function useAnnouncements() {
  const api = useApi()

  return useQuery({
    queryKey: announcementKeys.all,
    queryFn: async () => {
      const response = await api.announcements.$get()
      if (!response.ok) {
        throw new Error("Failed to fetch announcements")
      }
      return response.json()
    },
  })
}

export function useCreateAnnouncement() {
  const api = useApi()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (data: { title: string; body?: string }) => {
      const response = await api.announcements.$post({
        json: data,
      })
      if (!response.ok) {
        throw new Error("Failed to create announcement")
      }
      return response.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: announcementKeys.all })
    },
  })
}
