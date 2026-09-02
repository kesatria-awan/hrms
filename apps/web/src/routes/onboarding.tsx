import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { useState, useEffect } from "react"
import { useApi } from "@tracky/web/hooks/use-api"
import { authManager } from "@tracky/web/lib/auth-manager"
import { Button } from "@tracky/web/components/ui/button"
import { Input } from "@tracky/web/components/ui/input"
import { Label } from "@tracky/web/components/ui/label"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@tracky/web/components/ui/card"
import { Loader2 } from "lucide-react"
import { TrackyLogo } from "@tracky/web/components/tracky-logo"

export const Route = createFileRoute("/onboarding")({
  component: OnboardingPage,
})

function OnboardingPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const api = useApi()
  const [workspaceName, setWorkspaceName] = useState("")
  const [workspaceSlug, setWorkspaceSlug] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Redirect if user already owns a workspace
  const { data: authData } = useQuery({
    queryKey: ["auth", "me"],
    queryFn: async () => {
      const response = await api.auth.me.$get()
      if (!response.ok) throw new Error("Failed to fetch user")
      return response.json()
    },
  })

  useEffect(() => {
    if (authData?.ownsWorkspace) {
      navigate({ to: "/tasks" })
    }
  }, [authData, navigate])

  // Generate slug from workspace name
  const handleNameChange = (name: string) => {
    setWorkspaceName(name)
    // Auto-generate slug from name
    const slug = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
    setWorkspaceSlug(slug)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    setError(null)

    try {
      const token = authManager.getToken()

      // Guard against missing token
      if (!token) {
        throw new Error("Authentication required. Please sign in again.")
      }

      const response = await fetch("/api/auth/signup", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          workspaceName,
          workspaceSlug,
        }),
      })

      if (!response.ok) {
        // Handle non-JSON error responses gracefully
        const contentType = response.headers.get("content-type")
        if (contentType?.includes("application/json")) {
          try {
            const data = await response.json()
            throw new Error(data.message || `Request failed with status ${response.status}`)
          } catch (jsonError) {
            // JSON parsing failed despite content-type header
            if (jsonError instanceof SyntaxError) {
              const text = await response.text()
              throw new Error(`Request failed (${response.status}): ${text || response.statusText}`)
            }
            throw jsonError
          }
        } else {
          // Non-JSON response
          const text = await response.text()
          throw new Error(`Request failed (${response.status}): ${text || response.statusText}`)
        }
      }

      // Successfully created workspace - get the response data
      const responseData = await response.json()

      // Update the auth cache immediately with the new user/workspace data
      // This prevents WorkspaceGuard from redirecting back to onboarding
      queryClient.setQueryData(["auth", "me"], {
        user: responseData.user,
        workspace: responseData.workspace,
        ownsWorkspace: true,
      })

      // Redirect to dashboard
      navigate({ to: "/dashboard" })
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong")
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/20 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1 text-center">
          <div className="flex justify-center mb-4">
            <div className="bg-primary text-primary-foreground p-2 rounded-lg">
              <TrackyLogo className="h-6 w-6" />
            </div>
          </div>
          <CardTitle className="text-2xl font-bold">Create your workspace</CardTitle>
          <CardDescription>
            Welcome! Set up your workspace to get started with Tracky Pro.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="workspaceName">Workspace Name</Label>
              <Input
                id="workspaceName"
                placeholder="Acme Inc."
                value={workspaceName}
                onChange={(e) => handleNameChange(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="workspaceSlug">Workspace URL</Label>
              <div className="flex items-center">
                <span className="text-sm text-muted-foreground mr-1">tracky.app/</span>
                <Input
                  id="workspaceSlug"
                  placeholder="acme-inc"
                  value={workspaceSlug}
                  onChange={(e) => setWorkspaceSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
                  required
                  className="flex-1"
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Only lowercase letters, numbers, and hyphens
              </p>
            </div>
            {error && (
              <div className="text-sm text-destructive bg-destructive/10 p-3 rounded-md">
                {error}
              </div>
            )}
            <Button type="submit" className="w-full" disabled={isLoading}>
              {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Create Workspace
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
