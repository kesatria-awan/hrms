import { Activity, Loader2, RefreshCw } from "lucide-react"

import { Button } from "@tracky/web/components/ui/button"
import { useTaskActivities } from "@tracky/web/hooks/use-activities"
import { ActivityItem } from "./activity-item"

interface ActivityTimelineProps {
  taskId: string
}

export function ActivityTimeline({ taskId }: ActivityTimelineProps) {
  const { data: activities, isLoading, error, refetch } = useTaskActivities(taskId)

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-center">
        <p className="text-sm text-destructive mb-2">Failed to load activity.</p>
        <Button variant="outline" size="sm" onClick={() => refetch()}>
          <RefreshCw className="h-4 w-4 mr-2" />
          Try again
        </Button>
      </div>
    )
  }

  if (!activities || activities.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-center">
        <Activity className="h-8 w-8 text-muted-foreground/50 mb-2" />
        <p className="text-sm text-muted-foreground">
          No activity yet
        </p>
        <p className="text-xs text-muted-foreground mt-1">
          Activity will appear here as changes are made
        </p>
      </div>
    )
  }

  return (
    <div className="relative">
      {/* Hide the last timeline connector */}
      <div className="[&>*:last-child]:before:hidden [&>*:last-child_.absolute.left-\\[15px\\]]:hidden">
        {activities.map((activity) => (
          <ActivityItem key={activity.id} activity={activity} />
        ))}
      </div>
    </div>
  )
}
