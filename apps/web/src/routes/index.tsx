import { createFileRoute, Link, Navigate } from "@tanstack/react-router"
import { Button } from "@tracky/web/components/ui/button"
import { CheckCircle2, Zap, Shield } from "lucide-react"
import { TrackyLogo } from "@tracky/web/components/tracky-logo"
import { useAuth } from "@tracky/web/contexts/auth-context"

export const Route = createFileRoute("/")({
  component: IndexPage,
})

function IndexPage() {
  const { isAuthenticated, isLoading } = useAuth()
  if (isLoading) return null
  if (isAuthenticated) return <Navigate to="/dashboard" />
  return <LandingPage />
}

function LandingPage() {
  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="px-6 h-16 flex items-center justify-between border-b border-border/40 backdrop-blur sticky top-0 z-50">
        <div className="flex items-center gap-2 font-bold text-xl">
          <div className="bg-primary text-primary-foreground p-1 rounded-md">
            <TrackyLogo className="h-5 w-5" />
          </div>
          Tracky Pro
        </div>
        <div className="flex items-center gap-4">
          <Link to="/login" search={{ message: undefined, error: undefined }} className="text-sm font-medium hover:text-primary transition-colors">Log In</Link>
          <Button asChild>
            <Link to="/signup" search={{ error: undefined }}>Sign Up</Link>
          </Button>
        </div>
      </header>

      {/* Hero */}
      <section className="flex-1 flex flex-col items-center justify-center text-center px-4 py-20 space-y-8 max-w-4xl mx-auto">
        <div className="space-y-4">
          <h1 className="text-4xl sm:text-6xl font-extrabold tracking-tight bg-gradient-to-r from-foreground to-muted-foreground bg-clip-text text-transparent pb-2">
            Simplify your workflow. <br />
            Scale your team.
          </h1>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
            The task management platform designed for SMEs. Enterprise-grade isolation with consumer-grade simplicity.
          </p>
        </div>
        <div className="flex items-center gap-4">
          <Button size="lg" className="h-12 px-8 text-base" asChild>
            <Link to="/signup" search={{ error: undefined }}>Start your free workspace</Link>
          </Button>
          <Button size="lg" variant="outline" className="h-12 px-8 text-base">
            View Demo
          </Button>
        </div>

        <div className="pt-8 w-full">
          <div className="aspect-[16/9] rounded-xl border border-border shadow-2xl bg-muted/10 overflow-hidden relative">
            <div className="absolute inset-0 flex items-center justify-center text-muted-foreground">
              [App Screenshot Placeholder]
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="py-20 bg-muted/30 border-y border-border/40">
        <div className="max-w-6xl mx-auto px-6 grid md:grid-cols-3 gap-12">
          <div className="space-y-4">
            <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
              <Zap className="h-6 w-6" />
            </div>
            <h3 className="text-xl font-bold">Lightning Fast</h3>
            <p className="text-muted-foreground">Built for speed. No loading spinners, just instant transitions and real-time updates.</p>
          </div>
          <div className="space-y-4">
            <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
              <CheckCircle2 className="h-6 w-6" />
            </div>
            <h3 className="text-xl font-bold">Simple by Default</h3>
            <p className="text-muted-foreground">No complex setup. Start managing tasks in less than 5 minutes with our opinionated defaults.</p>
          </div>
          <div className="space-y-4">
            <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
              <Shield className="h-6 w-6" />
            </div>
            <h3 className="text-xl font-bold">Secure & Isolated</h3>
            <p className="text-muted-foreground">Every workspace is fully isolated. Enterprise-grade security for your peace of mind.</p>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-12 px-6 border-t border-border">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row justify-between gap-8">
          <div className="space-y-4">
            <div className="flex items-center gap-2 font-bold text-lg">
              <div className="bg-primary text-primary-foreground p-1 rounded-md">
                <TrackyLogo className="h-4 w-4" />
              </div>
              Tracky Pro
            </div>
            <p className="text-sm text-muted-foreground">© 2026 Tracky Pro Inc. All rights reserved.</p>
          </div>
          <div className="flex gap-12 text-sm">
            <div className="space-y-3">
              <h4 className="font-semibold">Product</h4>
              <ul className="space-y-2 text-muted-foreground">
                <li>Features</li>
                <li>Pricing</li>
                <li>Roadmap</li>
              </ul>
            </div>
            <div className="space-y-3">
              <h4 className="font-semibold">Company</h4>
              <ul className="space-y-2 text-muted-foreground">
                <li>About</li>
                <li>Blog</li>
                <li>Careers</li>
              </ul>
            </div>
            <div className="space-y-3">
              <h4 className="font-semibold">Legal</h4>
              <ul className="space-y-2 text-muted-foreground">
                <li>Privacy</li>
                <li>Terms</li>
                <li>Security</li>
              </ul>
            </div>
          </div>
        </div>
      </footer>
    </div>
  )
}
