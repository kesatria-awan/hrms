import { createFileRoute, Link, useNavigate } from "@tanstack/react-router"
import { useState, type FormEvent } from "react"
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

export const Route = createFileRoute("/login")({
  validateSearch: (search: Record<string, unknown>) => ({
    message: typeof search.message === "string" ? search.message : undefined,
    error: typeof search.error === "string" ? search.error : undefined,
  }),
  component: LoginPage,
})

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

function LoginPage() {
  const { message, error: oauthError } = Route.useSearch()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const { login } = useAuth()
  const navigate = useNavigate()

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setIsLoading(true)

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
        credentials: "include",
      })

      const data = (await res.json()) as { accessToken?: string; message?: string }

      if (!res.ok) {
        setError(data.message || "Something went wrong. Please try again.")
        return
      }

      login(data.accessToken!)
      navigate({ to: "/dashboard" })
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
          <CardTitle className="text-2xl font-bold">Sign in to Tracky Pro</CardTitle>
          <CardDescription>Enter your credentials to continue</CardDescription>
        </CardHeader>
        <CardContent>
          {message === "password-reset" && (
            <div className="mb-4 rounded-md bg-primary/10 p-3 text-sm text-primary">
              Your password has been reset. Sign in with your new password.
            </div>
          )}

          {oauthError === "google_denied" && (
            <div className="mb-4 bg-destructive/10 text-destructive rounded-md p-3 text-sm">
              Google sign-in was cancelled. Try again or use email and password.
            </div>
          )}
          {oauthError === "google_failed" && (
            <div className="mb-4 bg-destructive/10 text-destructive rounded-md p-3 text-sm">
              Something went wrong with Google sign-in. Please try again.
            </div>
          )}

          <Button variant="outline" className="w-full" onClick={() => { window.location.href = '/api/auth/google/login' }}>
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
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="password">Password</Label>
                <Link to="/forgot-password" className="text-sm text-primary hover:underline">
                  Forgot password?
                </Link>
              </div>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>

            {error && (
              <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                {error}
              </div>
            )}

            <Button type="submit" className="w-full" disabled={isLoading}>
              {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Sign in
            </Button>
          </form>

          <p className="mt-4 text-center text-sm text-muted-foreground">
            Don't have an account?{" "}
            <Link to="/signup" search={{ error: undefined }} className="text-primary hover:underline">
              Sign up
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
