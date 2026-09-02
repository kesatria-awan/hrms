import { useState, useCallback } from "react"
import { useQuery } from "@tanstack/react-query"
import { useApi } from "@tracky/web/hooks/use-api"

function getStorageKey(workspaceId: string) {
  return `tracky:announcements-last-seen:${workspaceId}`
}

export function useAnnouncementReadStatus() {
  const api = useApi()
  const { data: meData } = useQuery({
    queryKey: ["auth", "me"],
    queryFn: async () => {
      const response = await api.auth.me.$get()
      if (!response.ok) throw new Error("Failed to fetch user")
      return response.json()
    },
  })
  const workspaceId = meData?.workspace?.id

  const [lastSeen, setLastSeen] = useState<string | null>(() => {
    if (!workspaceId) return null
    return localStorage.getItem(getStorageKey(workspaceId))
  })

  const markAsRead = useCallback(
    (latestTimestamp: string) => {
      if (!workspaceId) return
      localStorage.setItem(getStorageKey(workspaceId), latestTimestamp)
      setLastSeen(latestTimestamp)
    },
    [workspaceId],
  )

  const hasUnread = useCallback(
    (latestAnnouncementTimestamp: string | undefined): boolean => {
      if (!latestAnnouncementTimestamp) return false
      if (!lastSeen) return true
      return new Date(latestAnnouncementTimestamp) > new Date(lastSeen)
    },
    [lastSeen],
  )

  return { lastSeen, markAsRead, hasUnread }
}
