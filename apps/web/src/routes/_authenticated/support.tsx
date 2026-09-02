import { createFileRoute } from "@tanstack/react-router"
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@tracky/web/components/ui/card"
import { Button } from "@tracky/web/components/ui/button"
import { Input } from "@tracky/web/components/ui/input"
import { Textarea } from "@tracky/web/components/ui/textarea"
import { Label } from "@tracky/web/components/ui/label"
import { Mail, MessageCircle, FileQuestion, Search, AlertCircle } from "lucide-react"

export const Route = createFileRoute("/_authenticated/support")({
  component: SupportPage,
})

function SupportPage() {
  return (
    <div className="max-w-5xl mx-auto space-y-8 animate-in fade-in duration-500">
      <div className="text-center space-y-2 py-8">
        <h1 className="text-3xl font-bold tracking-tight">How can we help?</h1>
        <p className="text-muted-foreground text-lg">Search our help center or contact support.</p>
        <div className="max-w-md mx-auto relative mt-4">
          <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
          <Input className="pl-10 h-10" placeholder="Search for answers..." />
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-8">
        {/* FAQs */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <FileQuestion className="h-5 w-5 text-primary" />
              <CardTitle>Frequently Asked Questions</CardTitle>
            </div>
            <CardDescription>Quick answers to common questions.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="border-b pb-3">
              <h4 className="font-medium">How do I create a new workspace?</h4>
              <p className="text-sm text-muted-foreground mt-1">
                Workspaces are created automatically when you sign up. Currently, each account is
                limited to one workspace.
              </p>
            </div>
            <div className="border-b pb-3">
              <h4 className="font-medium">Can I invite external clients?</h4>
              <p className="text-sm text-muted-foreground mt-1">
                Tracky Pro is currently designed for internal team collaboration. External guest access
                is on our roadmap.
              </p>
            </div>
            <div className="border-b pb-3">
              <h4 className="font-medium">How do I change my password?</h4>
              <p className="text-sm text-muted-foreground mt-1">
                Go to Settings &gt; Profile to update your password. If you forgot it, use the
                "Forgot Password" link on the login page.
              </p>
            </div>
            <div>
              <h4 className="font-medium">What are the storage limits?</h4>
              <p className="text-sm text-muted-foreground mt-1">
                Each workspace is limited to 10GB of file storage. You can view your usage in
                Workspace Settings.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Contact Form */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Mail className="h-5 w-5 text-primary" />
              <CardTitle>Contact Support</CardTitle>
            </div>
            <CardDescription>We typically respond within 2 hours.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Subject</Label>
              <Input placeholder="Briefly describe the issue" />
            </div>
            <div className="space-y-2">
              <Label>Message</Label>
              <Textarea placeholder="Detailed description of your problem..." className="min-h-[120px]" />
            </div>
            <Button className="w-full">
              <MessageCircle className="mr-2 h-4 w-4" />
              Send Message
            </Button>

            <div className="bg-muted/50 p-4 rounded-lg flex gap-3 text-sm text-muted-foreground mt-4">
              <AlertCircle className="h-5 w-5 shrink-0 text-orange-500" />
              <p>
                Our support team is available Mon-Fri, 9am - 6pm EST. Urgent issues are monitored
                24/7.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
