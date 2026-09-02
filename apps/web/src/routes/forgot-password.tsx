import { createFileRoute, Link } from "@tanstack/react-router"
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
import { TrackyLogo } from "@tracky/web/components/tracky-logo"

export const Route = createFileRoute("/forgot-password")({
  component: ForgotPasswordPage,
})

type PageState = "idle" | "submitting" | "submitted" | "error"

function ForgotPasswordPage() {
  const [email, setEmail] = useState("")
  const [pageState, setPageState] = useState<PageState>("idle")
  const [error, setError] = useState<string | null>(null)

  const isLoading = pageState === "submitting"

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setPageState("submitting")

    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
        credentials: "include",
      })

      if (!res.ok) {
        // Network/server error — still show confirmation to avoid enumeration
        const data = (await res.json()) as { message?: string }
        setError(data.message || "Something went wrong. Please try again.")
        setPageState("error")
        return
      }

      // D-11: Always show confirmation regardless — never hint about email existence
      setPageState("submitted")
    } catch {
      setError("Something went wrong. Please try again.")
      setPageState("error")
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/20 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 flex h-10 w-10 items-center justify-center rounded-lg bg-primary p-2">
            <TrackyLogo className="h-6 w-6 text-primary-foreground" />
          </div>
          {pageState === "submitted" ? (
            <>
              <CardTitle className="text-2xl font-bold">Check your email</CardTitle>
              <CardDescription>
                If an account exists for that address, you&apos;ll receive a reset link shortly.
              </CardDescription>
            </>
          ) : (
            <>
              <CardTitle className="text-2xl font-bold">Forgot your password?</CardTitle>
              <CardDescription>
                Enter your email and we&apos;ll send you a reset link.
              </CardDescription>
            </>
          )}
        </CardHeader>
        <CardContent className="space-y-4">
          {pageState !== "submitted" && (
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

              {error && (
                <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                  {error}
                </div>
              )}

              <Button type="submit" className="w-full" disabled={isLoading}>
                {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Send reset link
              </Button>
            </form>
          )}

          <p className="text-sm text-center text-muted-foreground">
            <Link to="/login" search={{ message: undefined, error: undefined }} className="text-primary hover:underline">
              Back to sign in
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
