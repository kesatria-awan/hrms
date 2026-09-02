import { Link } from "@tanstack/react-router"
import { Megaphone, X } from "lucide-react"
import { useAnnouncements } from "@tracky/web/hooks/use-announcements"
import { useAnnouncementReadStatus } from "@tracky/web/hooks/use-announcement-read-status"

export function AnnouncementBanner() {
  const { data: announcements } = useAnnouncements()
  const { hasUnread, markAsRead } = useAnnouncementReadStatus()

  const latest = announcements?.[0]

  if (!latest || !hasUnread(latest.createdAt)) return null

  return (
    <div className="bg-[#0f4c3a] text-white px-4 py-2.5 flex items-center gap-3 shrink-0">
      <Link
        to="/announcements"
        className="flex-1 flex items-center gap-3 min-w-0"
      >
        <Megaphone className="h-4 w-4 shrink-0" />
        <span className="text-sm font-medium truncate">{latest.title}</span>
        <span className="text-xs text-white/70 shrink-0">View all</span>
      </Link>
      <button
        onClick={(e) => {
          e.preventDefault()
          e.stopPropagation()
          markAsRead(latest.createdAt)
        }}
        className="shrink-0 p-1 rounded hover:bg-white/10 transition-colors"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  )
}
