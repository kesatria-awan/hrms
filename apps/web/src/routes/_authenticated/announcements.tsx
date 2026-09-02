import { createFileRoute } from "@tanstack/react-router"
import { useState, useEffect } from "react"
import { useQuery } from "@tanstack/react-query"
import { formatDistanceToNow } from "date-fns"
import { useApi } from "@tracky/web/hooks/use-api"
import { Button } from "@tracky/web/components/ui/button"
import { Input } from "@tracky/web/components/ui/input"
import { Textarea } from "@tracky/web/components/ui/textarea"
import { Avatar, AvatarFallback, AvatarImage } from "@tracky/web/components/ui/avatar"
import { Megaphone, Plus, Loader2 } from "lucide-react"
import { useAnnouncements, useCreateAnnouncement } from "@tracky/web/hooks/use-announcements"
import { useAnnouncementReadStatus } from "@tracky/web/hooks/use-announcement-read-status"

export const Route = createFileRoute("/_authenticated/announcements")({
  component: AnnouncementsPage,
})

function AnnouncementsPage() {
  const { data: announcements, isLoading } = useAnnouncements()
  const createAnnouncement = useCreateAnnouncement()
  const api = useApi()
  const { data: meData } = useQuery({
    queryKey: ["auth", "me"],
    queryFn: async () => {
      const response = await api.auth.me.$get()
      if (!response.ok) throw new Error("Failed to fetch user")
      return response.json()
    },
  })
  const { markAsRead } = useAnnouncementReadStatus()
  const isAdmin = meData?.user?.role === "workspace_admin"
  const [showForm, setShowForm] = useState(false)
  const [title, setTitle] = useState("")
  const [body, setBody] = useState("")

  // Auto-mark as read on visit
  useEffect(() => {
    if (announcements && announcements.length > 0) {
      markAsRead(announcements[0].createdAt)
    }
  }, [announcements, markAsRead])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim()) return
    createAnnouncement.mutate(
      { title: title.trim(), body: body.trim() || undefined },
      {
        onSuccess: () => {
          setTitle("")
          setBody("")
          setShowForm(false)
        },
      },
    )
  }

  const getInitials = (firstName: string | null, lastName: string | null, email: string) => {
    if (firstName && lastName) return `${firstName[0]}${lastName[0]}`.toUpperCase()
    if (firstName) return firstName[0].toUpperCase()
    return email[0]?.toUpperCase() || "?"
  }

  return (
    <div className="h-full flex flex-col animate-in fade-in duration-500 -m-6">
      {/* Header section */}
      <div className="bg-background border-b border-border px-8 py-6 shrink-0 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Megaphone className="h-6 w-6 text-[#0f4c3a]" />
            <h1 className="text-2xl font-bold tracking-tight">Announcements</h1>
          </div>
          {isAdmin && !showForm && (
            <Button
              className="bg-[#0f4c3a] hover:bg-[#0f4c3a]/90 text-white shadow-none"
              onClick={() => setShowForm(true)}
            >
              <Plus className="mr-2 h-4 w-4" />
              New Announcement
            </Button>
          )}
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 min-h-0 bg-muted/20 p-8 overflow-y-auto">
        <div className="max-w-3xl mx-auto space-y-6">
          {/* Create form */}
          {showForm && (
            <form onSubmit={handleSubmit} className="p-5 rounded-lg border bg-background space-y-3">
              <Input
                placeholder="Announcement title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
              />
              <Textarea
                placeholder="Body (optional)"
                value={body}
                onChange={(e) => setBody(e.target.value)}
                rows={3}
              />
              <div className="flex gap-2 justify-end">
                <Button type="button" variant="ghost" onClick={() => setShowForm(false)}>
                  Cancel
                </Button>
                <Button
                  type="submit"
                  className="bg-[#0f4c3a] hover:bg-[#0f4c3a]/90 text-white"
                  disabled={createAnnouncement.isPending}
                >
                  {createAnnouncement.isPending ? "Posting..." : "Post Announcement"}
                </Button>
              </div>
            </form>
          )}

          {/* Loading */}
          {isLoading && (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          )}

          {/* Empty state */}
          {!isLoading && announcements && announcements.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Megaphone className="h-12 w-12 text-muted-foreground/50 mb-4" />
              <h3 className="text-lg font-medium mb-1">No announcements yet</h3>
              <p className="text-sm text-muted-foreground">
                {isAdmin
                  ? "Create the first announcement for your team."
                  : "Check back later for updates from your team."}
              </p>
            </div>
          )}

          {/* Announcement feed */}
          {!isLoading && announcements && announcements.length > 0 && (
            <div className="space-y-4">
              {announcements.map((a) => (
                <div
                  key={a.id}
                  className="p-5 rounded-lg border bg-background"
                >
                  <div className="flex items-start gap-4">
                    <Avatar className="h-10 w-10 border border-slate-200">
                      <AvatarImage src={a.author.imageUrl || undefined} />
                      <AvatarFallback>
                        {getInitials(a.author.firstName, a.author.lastName, a.author.email)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold">
                          {[a.author.firstName, a.author.lastName].filter(Boolean).join(" ") || a.author.email}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {formatDistanceToNow(new Date(a.createdAt), { addSuffix: true })}
                        </span>
                      </div>
                      <h3 className="text-base font-medium mt-1">{a.title}</h3>
                      {a.body && (
                        <p className="text-sm text-muted-foreground mt-1 whitespace-pre-wrap">{a.body}</p>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
