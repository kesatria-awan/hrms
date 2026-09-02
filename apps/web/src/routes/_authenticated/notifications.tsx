import { createFileRoute } from "@tanstack/react-router"
import { Button } from "@tracky/web/components/ui/button"
import { Badge } from "@tracky/web/components/ui/badge"
import { Card } from "@tracky/web/components/ui/card"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@tracky/web/components/ui/select"
import { useState } from "react"
import { Switch } from "@tracky/web/components/ui/switch"

export const Route = createFileRoute("/_authenticated/notifications")({
  component: NotificationsPage,
})

// Mock Data
const notifications = [
  {
    id: 1,
    type: 'mention',
    actor: { name: 'User A', avatar: 'https://github.com/shadcn.png' },
    title: '@mention by User A',
    message: '"Please check this task"',
    task: 'Fix login bug',
    board: 'Platform',
    time: '2 min ago',
    isUnread: true,
  },
  {
    id: 2,
    type: 'assignment',
    actor: { name: 'System', avatar: '' },
    title: 'Task assigned to you',
    message: '',
    task: 'Update invoice',
    board: 'Finance',
    time: '15 min ago',
    isUnread: true,
  },
  {
    id: 3,
    type: 'overdue',
    actor: { name: 'System', avatar: '' },
    title: 'Task overdue',
    message: '',
    task: 'Review proposal',
    board: 'Sales',
    due: 'Jan 15',
    time: 'Yesterday',
    isUnread: false,
  }
]

function NotificationsPage() {
  const [activeTab, setActiveTab] = useState("feed")

  return (
    <div className="h-full flex flex-col animate-in fade-in duration-500 -m-6">
      {/* Header section */}
      <div className="bg-background border-b border-border px-8 py-6 shrink-0 space-y-6">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold tracking-tight">Notifications</h1>
          <Badge variant="destructive" className="rounded-full px-2.5 py-0.5 text-xs font-normal">3 new</Badge>
        </div>

        <div className="flex items-center gap-8 border-b border-transparent">
          <TabButton
            active={activeTab === "feed"}
            onClick={() => setActiveTab("feed")}
          >
            Notifications Feed
          </TabButton>
          <TabButton
            active={activeTab === "settings"}
            onClick={() => setActiveTab("settings")}
          >
            Notification Settings
          </TabButton>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 min-h-0 bg-muted/20 p-8 overflow-y-auto">
        {activeTab === "feed" ? <NotificationsFeed /> : <NotificationSettings />}
      </div>
    </div>
  )
}

function NotificationsFeed() {
  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Toolbar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Select defaultValue="all">
            <SelectTrigger className="w-[120px] bg-background">
              <SelectValue placeholder="All" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="mentions">Mentions</SelectItem>
              <SelectItem value="assignments">Assignments</SelectItem>
            </SelectContent>
          </Select>

          <Select defaultValue="unread">
            <SelectTrigger className="w-[120px] bg-background">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="unread">Unread</SelectItem>
              <SelectItem value="read">Read</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <Button variant="outline" className="text-sm">
          Mark all as read
        </Button>
      </div>

      {/* Feed Items */}
      <div className="space-y-4">
        {notifications.map(item => (
          <Card key={item.id} className="p-6 flex gap-4 transition-all hover:shadow-md border-border/60">
            {/* Unread Indicator */}
            <div className="pt-2">
              <div className={`h-2.5 w-2.5 rounded-full ${item.isUnread ? 'bg-red-500' : 'bg-transparent'}`} />
            </div>

            <div className="flex-1 space-y-4">
              {/* Header Row */}
              <div className="flex items-start justify-between">
                <div className="space-y-1">
                  <NotificationTypeBadge type={item.type} />
                  <h3 className="text-base font-semibold">{item.title}</h3>
                  {item.message && (
                    <p className="text-sm text-muted-foreground">"{item.message}"</p>
                  )}
                </div>
                <span className="text-xs text-muted-foreground whitespace-nowrap">{item.time}</span>
              </div>

              {/* Context Row */}
              <div className="flex items-center flex-wrap gap-x-8 gap-y-2 text-sm">
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground">Task:</span>
                  <span className="font-medium">{item.task}</span>
                </div>

                {item.due && (
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground">Due:</span>
                    <span className="font-medium text-rose-500">{item.due}</span>
                  </div>
                )}

                <div className="flex items-center gap-2 ml-auto sm:ml-0">
                  <span className="text-muted-foreground">Board:</span>
                  <BoardBadge board={item.board} />
                </div>
              </div>

              {/* Actions Row */}
              <div className="flex items-center gap-3 pt-1">
                <Button size="sm" className="bg-primary hover:bg-primary/90 text-primary-foreground h-8 px-4 font-normal">
                  Open Task
                </Button>
                {item.isUnread && (
                  <Button size="sm" variant="outline" className="h-8 px-4 font-normal">
                    Mark as read
                  </Button>
                )}
              </div>
            </div>
          </Card>
        ))}
      </div>

      <div className="flex justify-center pt-4">
        <Button variant="outline" className="bg-background">Load more</Button>
      </div>
    </div>
  )
}

function NotificationSettings() {
  return (
    <div className="max-w-2xl mx-auto">
      <Card className="p-8 space-y-8">
        <div>
          <h3 className="text-lg font-semibold mb-1">Email Notifications</h3>
          <p className="text-sm text-muted-foreground mb-4">Choose what updates you want to receive via email.</p>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium">Mentions</label>
              <Switch defaultChecked />
            </div>
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium">Assignments</label>
              <Switch defaultChecked />
            </div>
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium">Due Date Reminders</label>
              <Switch defaultChecked />
            </div>
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium">Daily Summary</label>
              <Switch />
            </div>
          </div>
        </div>

        <div className="pt-6 border-t border-border">
          <h3 className="text-lg font-semibold mb-1">Push Notifications</h3>
          <p className="text-sm text-muted-foreground mb-4">Manage your browser and mobile push notifications.</p>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium">All Activity</label>
              <Switch defaultChecked />
            </div>
          </div>
        </div>
      </Card>
    </div>
  )
}

/** HELPER COMPONENTS */

function TabButton({ children, active, onClick }: { children: React.ReactNode, active: boolean, onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`pb-3 text-sm font-semibold border-b-[3px] transition-all ${active
        ? "border-primary text-foreground"
        : "border-transparent text-muted-foreground hover:text-foreground"
        }`}
    >
      {children}
    </button>
  )
}

function NotificationTypeBadge({ type }: { type: string }) {
  const styles = {
    mention: "bg-rose-100 text-rose-600",
    assignment: "bg-blue-100 text-blue-600",
    overdue: "bg-amber-100 text-amber-700",
  }

  // Capitalize first letter
  const label = type.charAt(0).toUpperCase() + type.slice(1)

  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] uppercase font-bold tracking-wide mb-1 ${styles[type as keyof typeof styles] || 'bg-slate-100'}`}>
      {label}
    </span>
  )
}

function BoardBadge({ board }: { board: string }) {
  const colors = {
    'Finance': 'bg-pink-100 text-pink-700',
    'Platform': 'bg-blue-100 text-blue-700',
    'Sales': 'bg-green-100 text-green-700',
    'HR': 'bg-purple-100 text-purple-700',
    'Marketing': 'bg-teal-100 text-teal-700',
    'Design System': 'bg-rose-100 text-rose-700',
  }
  const color = colors[board as keyof typeof colors] || 'bg-slate-100 text-slate-700'

  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold ${color}`}>
      {board}
    </span>
  )
}
