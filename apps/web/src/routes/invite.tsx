import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { useState, useEffect, useRef } from "react"
import { Loader2 } from "lucide-react"
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
import { Separator } from "@tracky/web/components/ui/separator"
import { TrackyLogo } from "@tracky/web/components/tracky-logo"
import { useAuth } from "@tracky/web/contexts/auth-context"
import { fetchWithAuth } from "@tracky/web/lib/fetch-with-auth"

function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24">
      <path
        fill="currentColor"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      />
      <path
        fill="currentColor"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      />
      <path
        fill="currentColor"
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
      />
      <path
        fill="currentColor"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
      />
    </svg>
  )
}

type InviteData = {
  email: string
  workspaceName: string
  inviterName: string | null
  role: string
}

type PageState =
  | { type: "loading" }
  | { type: "invalid" }
  | { type: "auto-accept"; inviteData: InviteData }
  | { type: "signup"; inviteData: InviteData }

export const Route = createFileRoute("/invite")({
  validateSearch: (search: Record<string, unknown>) => ({
    token: typeof search.token === "string" ? search.token : undefined,
  }),
  component: InvitePage,
})

function InvitePage() {
  const { token } = Route.useSearch()
  const { isAuthenticated, isLoading: authLoading } = useAuth()
  const [pageState, setPageState] = useState<PageState>({ type: "loading" })
  const fetchedRef = useRef(false)

  useEffect(() => {
    if (authLoading) return
    if (!token) return
    if (fetchedRef.current) return
    fetchedRef.current = true

    fetch(`/api/auth/invite?token=${encodeURIComponent(token)}`, {
      credentials: "include",
    })
      .then(async (res) => {
        if (!res.ok) {
          setPageState({ type: "invalid" })
          return
        }
        const data = (await res.json()) as InviteData
        if (isAuthenticated) {
          setPageState({ type: "auto-accept", inviteData: data })
        } else {
          setPageState({ type: "signup", inviteData: data })
        }
      })
      .catch(() => {
        setPageState({ type: "invalid" })
      })
  }, [token, isAuthenticated, authLoading])

  if (!token && !authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-muted/20 p-4">
        <InvalidInvitation />
      </div>
    )
  }

  if (pageState.type === "loading" || authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-muted/20 p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 flex h-10 w-10 items-center justify-center rounded-lg bg-primary p-2">
              <TrackyLogo className="h-6 w-6 text-primary-foreground" />
            </div>
            <CardTitle className="text-2xl font-bold">Loading...</CardTitle>
          </CardHeader>
          <CardContent className="flex justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </CardContent>
        </Card>
      </div>
    )
  }

  if (pageState.type === "invalid") {
    return <InvalidInvitation />
  }

  if (pageState.type === "auto-accept") {
    return <AutoAccept token={token!} inviteData={pageState.inviteData} />
  }

  if (pageState.type === "signup") {
    return <InviteSignup token={token!} inviteData={pageState.inviteData} />
  }

  return <InvalidInvitation />
}

function InvalidInvitation() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/20 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 flex h-10 w-10 items-center justify-center rounded-lg bg-primary p-2">
            <TrackyLogo className="h-6 w-6 text-primary-foreground" />
          </div>
          <CardTitle className="text-2xl font-bold">Invitation not found</CardTitle>
          <CardDescription>
            This invitation link is invalid or has expired. Please request a new invitation from
            your workspace administrator.
          </CardDescription>
        </CardHeader>
      </Card>
    </div>
  )
}

function AutoAccept({ token, inviteData }: { token: string; inviteData: InviteData }) {
  const navigate = useNavigate()
  const [error, setError] = useState<string | null>(null)
  const [alreadyMember, setAlreadyMember] = useState(false)
  const acceptedRef = useRef(false)

  useEffect(() => {
    if (acceptedRef.current) return
    acceptedRef.current = true

    fetchWithAuth("/api/auth/invite/accept", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    })
      .then(async (res) => {
        if (res.ok) {
          navigate({ to: "/dashboard", replace: true })
          return
        }
        const data = (await res.json()) as { message?: string }
        if (res.status === 409 && data.message?.includes("already a member")) {
          setAlreadyMember(true)
        } else {
          setError(data.message || "Something went wrong. Please try again.")
        }
      })
      .catch(() => {
        setError("Something went wrong. Please try again.")
      })
  }, [token, navigate])

  if (alreadyMember) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-muted/20 p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 flex h-10 w-10 items-center justify-center rounded-lg bg-primary p-2">
              <TrackyLogo className="h-6 w-6 text-primary-foreground" />
            </div>
            <CardTitle className="text-2xl font-bold">You're already a member</CardTitle>
            <CardDescription>
              You already have access to this workspace. Go to your dashboard to get started.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              className="w-full"
              onClick={() => navigate({ to: "/dashboard", replace: true })}
            >
              Go to dashboard
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/20 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 flex h-10 w-10 items-center justify-center rounded-lg bg-primary p-2">
            <TrackyLogo className="h-6 w-6 text-primary-foreground" />
          </div>
          <CardTitle className="text-2xl font-bold">Joining workspace...</CardTitle>
          <CardDescription>
            Please wait while we add you to {inviteData.workspaceName}.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col items-center gap-4">
          {error ? (
            <div className="w-full rounded-md bg-destructive/10 p-3 text-sm text-destructive">
              {error}
            </div>
          ) : (
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function InviteSignup({ token, inviteData }: { token: string; inviteData: InviteData }) {
  const navigate = useNavigate()
  const { login } = useAuth()
  const [firstName, setFirstName] = useState("")
  const [lastName, setLastName] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  const roleLabel = inviteData.role === "admin" ? "an admin" : "a member"
  const inviterText = inviteData.inviterName
    ? `${inviteData.inviterName} invited you`
    : "You were invited"

  const handleGoogleOAuth = () => {
    // Store the invite URL so user can auto-accept after Google OAuth completes
    sessionStorage.setItem("invite_redirect", `/invite?token=${encodeURIComponent(token)}`)
    window.location.href = "/api/auth/google/login"
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (password.length < 8) {
      setError("Password must be at least 8 characters")
      return
    }

    setIsLoading(true)

    try {
      const res = await fetch("/api/auth/invite/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, firstName, lastName, password }),
        credentials: "include",
      })

      const data = (await res.json()) as { accessToken?: string; message?: string }

      if (!res.ok) {
        setError(data.message || "Something went wrong. Please try again.")
        return
      }

      if (data.accessToken) {
        login(data.accessToken)
      }
      navigate({ to: "/dashboard", replace: true })
    } catch {
      setError("Something went wrong. Please try again.")
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/20 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 flex h-10 w-10 items-center justify-center rounded-lg bg-primary p-2">
            <TrackyLogo className="h-6 w-6 text-primary-foreground" />
          </div>
          <CardTitle className="text-2xl font-bold">Join {inviteData.workspaceName}</CardTitle>
          <CardDescription>
            {inviterText} to join as {roleLabel}. Create your account to get started.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {error && (
            <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
              {error}
            </div>
          )}

          <Button variant="outline" className="w-full" onClick={handleGoogleOAuth}>
            <GoogleIcon className="mr-2 h-4 w-4" />
            Continue with Google
          </Button>

          <div className="relative my-4">
            <Separator />
            <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-card px-2 text-xs uppercase text-muted-foreground">
              or continue with email
            </span>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={inviteData.email}
                readOnly
                className="bg-muted cursor-not-allowed opacity-75"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="firstName">First name</Label>
                <Input
                  id="firstName"
                  type="text"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="lastName">Last name</Label>
                <Input
                  id="lastName"
                  type="text"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>

            <Button type="submit" className="w-full" disabled={isLoading}>
              {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Create account & join
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
