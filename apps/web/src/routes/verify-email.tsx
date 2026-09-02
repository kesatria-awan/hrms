import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { useState, useEffect, useRef, useCallback } from "react"
import { Loader2, Mail } from "lucide-react"
import { Button } from "@tracky/web/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@tracky/web/components/ui/card"
import { useAuth } from "@tracky/web/contexts/auth-context"
import { authManager } from "@tracky/web/lib/auth-manager"

export const Route = createFileRoute("/verify-email")({
  validateSearch: (search: Record<string, unknown>) => ({
    token: typeof search.token === "string" ? search.token : undefined,
  }),
  component: VerifyEmailPage,
})

function VerifyEmailPage() {
  const { token } = Route.useSearch()
  const { user, login, logout } = useAuth()
  const navigate = useNavigate()

  if (token) {
    return <VerifyWithToken token={token} login={login} navigate={navigate} />
  }

  return <CheckYourEmail user={user} logout={logout} navigate={navigate} />
}

function VerifyWithToken({
  token,
  login,
  navigate,
}: {
  token: string
  login: (accessToken: string) => void
  navigate: ReturnType<typeof useNavigate>
}) {
  type VerifyState = "verifying" | "verified" | "failed"
  const [state, setState] = useState<VerifyState>("verifying")

  useEffect(() => {
    fetch(`/api/auth/verify-email?token=${encodeURIComponent(token)}`, {
      credentials: "include",
    })
      .then(async (res) => {
        if (res.ok) {
          setState("verified")
          // Refresh token to get updated JWT with emailVerifiedAt
          const newToken = await authManager.refresh()
          if (newToken) {
            login(newToken)
          }
          navigate({ to: "/dashboard" })
        } else {
          setState("failed")
        }
      })
      .catch(() => {
        setState("failed")
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/20 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 flex h-10 w-10 items-center justify-center rounded-lg bg-primary p-2">
            <Mail className="h-6 w-6 text-primary-foreground" />
          </div>
          {state === "verified" && (
            <>
              <CardTitle className="text-2xl font-bold">Email verified</CardTitle>
              <CardDescription>Redirecting you now...</CardDescription>
            </>
          )}
          {state === "failed" && (
            <>
              <CardTitle className="text-2xl font-bold">Verify your email</CardTitle>
              <CardDescription>
                This verification link is invalid or has expired.
              </CardDescription>
            </>
          )}
        </CardHeader>
        <CardContent className="flex flex-col items-center gap-4">
          {state === "verifying" && (
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          )}
          {state === "failed" && (
            <Button
              variant="default"
              className="w-full"
              onClick={() => navigate({ to: "/verify-email", search: { token: undefined } })}
            >
              Request a new link
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function CheckYourEmail({
  user,
  logout,
  navigate,
}: {
  user: { id: string; email: string; role: string } | null
  logout: () => Promise<void>
  navigate: ReturnType<typeof useNavigate>
}) {
  const [resendLoading, setResendLoading] = useState(false)
  const [countdown, setCountdown] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const startCountdown = useCallback(() => {
    setCountdown(60)
    intervalRef.current = setInterval(() => {
      setCountdown((prev) => {
        if (prev === null || prev <= 1) {
          clearInterval(intervalRef.current!)
          intervalRef.current = null
          return null
        }
        return prev - 1
      })
    }, 1000)
  }, [])

  useEffect(() => {
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
      }
    }
  }, [])

  async function handleResend() {
    if (!user?.email) return
    setError(null)
    setResendLoading(true)
    try {
      const res = await fetch("/api/auth/resend-verification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: user.email }),
        credentials: "include",
      })
      if (!res.ok) {
        const data = (await res.json()) as { message?: string }
        setError(data.message || "Something went wrong. Please try again.")
        return
      }
      startCountdown()
    } catch {
      setError("Something went wrong. Please try again.")
    } finally {
      setResendLoading(false)
    }
  }

  const isButtonDisabled = resendLoading || countdown !== null

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/20 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 flex h-10 w-10 items-center justify-center rounded-lg bg-primary p-2">
            <Mail className="h-6 w-6 text-primary-foreground" />
          </div>
          <CardTitle className="text-2xl font-bold">Check your email</CardTitle>
          <CardDescription>
            We sent a verification link to your email address.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-center text-muted-foreground">
            Click the link in the email to verify your account and get started.
          </p>

          <Button
            variant="outline"
            className="w-full"
            disabled={isButtonDisabled}
            onClick={handleResend}
          >
            {resendLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {countdown !== null
              ? `Resend in ${countdown}s...`
              : "Resend verification email"}
          </Button>

          {error && (
            <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
              {error}
            </div>
          )}

          <p className="text-sm text-center text-muted-foreground">
            Wrong email?{" "}
            <button
              type="button"
              className="text-primary hover:underline"
              onClick={async () => {
                await logout()
                navigate({ to: "/login", search: { message: undefined, error: undefined } })
              }}
            >
              Sign out
            </button>
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
