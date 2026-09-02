import { createFileRoute, Link, useNavigate } from "@tanstack/react-router"
import { Button } from "@tracky/web/components/ui/button"
import { Input } from "@tracky/web/components/ui/input"
import { Label } from "@tracky/web/components/ui/label"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@tracky/web/components/ui/card"
import { LayoutDashboard } from "lucide-react"

export const Route = createFileRoute("/signup")({
    component: SignupPage,
})

function SignupPage() {
    const navigate = useNavigate()

    const handleSignup = (e: React.FormEvent) => {
        e.preventDefault()
        // Mock signup - just redirect
        navigate({ to: "/dashboard" })
    }

    return (
        <div className="min-h-screen flex items-center justify-center bg-muted/20 p-4">
            <Card className="w-full max-w-md">
                <CardHeader className="space-y-1 text-center">
                    <div className="flex justify-center mb-4">
                        <div className="bg-primary text-primary-foreground p-2 rounded-lg">
                            <LayoutDashboard className="h-6 w-6" />
                        </div>
                    </div>
                    <CardTitle className="text-2xl font-bold">Create your workspace</CardTitle>
                    <CardDescription>
                        Get started with Tracky for free. No credit card required.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <form onSubmit={handleSignup} className="space-y-4">
                        <div className="space-y-2">
                            <Label htmlFor="company">Company Name</Label>
                            <Input id="company" placeholder="Acme Inc." required />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="email">Work Email</Label>
                            <Input id="email" type="email" placeholder="name@company.com" required />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="password">Password</Label>
                            <Input id="password" type="password" required />
                        </div>
                        <Button type="submit" className="w-full">
                            Create Workspace
                        </Button>
                    </form>
                </CardContent>
                <CardFooter className="flex flex-col gap-4">
                    <div className="text-center text-sm text-muted-foreground w-full">
                        Already have a specific workspace?{" "}
                        <Link to="/login" className="text-primary font-medium hover:underline">
                            Sign in
                        </Link>
                    </div>
                    <p className="text-xs text-center text-muted-foreground">
                        By clicking "Create Workspace", you agree to our Terms of Service and Privacy Policy.
                    </p>
                </CardFooter>
            </Card>
        </div>
    )
}
