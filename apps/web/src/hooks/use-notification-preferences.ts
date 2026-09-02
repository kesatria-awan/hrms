import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"

import { useApi } from "./use-api"

export type NotificationPreferences = {
  taskNotifications: boolean
  collaborationNotifications: boolean
  adminNotifications: boolean
}

export const notificationPreferencesKey = ["notification-preferences"] as const

export function useNotificationPreferences() {
  const api = useApi()
  return useQuery({
    queryKey: notificationPreferencesKey,
    queryFn: async () => {
      const response = await api["notification-preferences"].$get()
      if (!response.ok) throw new Error("Failed to fetch notification preferences")
      return response.json() as Promise<NotificationPreferences>
    },
  })
}

export function useUpdateNotificationPreferences() {
  const api = useApi()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (prefs: NotificationPreferences) => {
      const response = await api["notification-preferences"].$put({ json: prefs })
      if (!response.ok) throw new Error("Failed to update preferences")
      return response.json() as Promise<NotificationPreferences>
    },
    onMutate: async (newPrefs) => {
      await queryClient.cancelQueries({ queryKey: notificationPreferencesKey })
      const previous = queryClient.getQueryData<NotificationPreferences>(notificationPreferencesKey)
      queryClient.setQueryData(notificationPreferencesKey, newPrefs)
      return { previous }
    },
    onError: (_err, _newPrefs, context) => {
      if (context?.previous) {
        queryClient.setQueryData(notificationPreferencesKey, context.previous)
      }
      toast.error("Failed to update preferences. Please try again.")
    },
    onSuccess: () => {
      toast.success("Notification preferences updated")
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: notificationPreferencesKey })
    },
  })
}
