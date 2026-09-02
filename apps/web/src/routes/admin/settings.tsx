import { createFileRoute } from "@tanstack/react-router"
import { Construction } from "lucide-react"
import { Card, CardContent } from "@tracky/web/components/ui/card"

export const Route = createFileRoute("/admin/settings")({
  component: AdminSettingsPage,
})

function AdminSettingsPage() {
  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Admin Settings</h1>
        <p className="text-muted-foreground mt-1">
          Configure platform-wide settings
        </p>
      </div>

      {/* Placeholder */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center mb-4">
              <Construction className="h-8 w-8 text-muted-foreground" />
            </div>
            <h2 className="text-xl font-semibold mb-2">Coming Soon</h2>
            <p className="text-muted-foreground max-w-md">
              Admin settings page is under construction.
              Configuration options for platform-wide settings will be available here.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
