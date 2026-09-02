import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { Loader2 } from "lucide-react"
import { useEffect } from "react"

import { useAuth } from "@tracky/web/contexts/auth-context"

export const Route = createFileRoute("/oauth/callback")({
  validateSearch: (search: Record<string, unknown>) => ({
    token: typeof search.token === "string" ? search.token : undefined,
  }),
  component: OAuthCallbackPage,
})

function OAuthCallbackPage() {
  const { token } = Route.useSearch()
  const { login } = useAuth()
  const navigate = useNavigate()

  useEffect(() => {
    if (!token) {
      navigate({ to: "/login", search: { error: "google_failed", message: undefined }, replace: true })
      return
    }
    login(token)

    // Check for pending invite redirect (set by invite.tsx Google OAuth flow)
    const pendingInvite = sessionStorage.getItem("invite_redirect")
    sessionStorage.removeItem("invite_redirect")

    if (pendingInvite) {
      // pendingInvite is a path like "/invite?token=abc123"
      window.location.href = pendingInvite
    } else {
      navigate({ to: "/dashboard", replace: true })
    }
  }, [token, login, navigate])

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/20">
      <div className="text-center">
        <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4 text-primary" />
        <p className="text-muted-foreground">Completing sign in...</p>
      </div>
    </div>
  )
}
