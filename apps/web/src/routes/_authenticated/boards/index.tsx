import { createFileRoute, Link } from "@tanstack/react-router"
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@tracky/web/components/ui/card"
import { Button } from "@tracky/web/components/ui/button"
import { Input } from "@tracky/web/components/ui/input"
import { Plus, Search, MoreHorizontal, LayoutGrid, List } from "lucide-react"

export const Route = createFileRoute("/_authenticated/boards/")({
    component: BoardsList,
})

function BoardsList() {
    return (
        <div className="space-y-6 h-full flex flex-col animate-in fade-in duration-500">
            <div className="flex items-center justify-between">
                <div className="space-y-1">
                    <h1 className="text-3xl font-bold tracking-tight">Boards</h1>
                    <p className="text-muted-foreground">Manage and track your projects.</p>
                </div>
                <Button>
                    <Plus className="mr-2 h-4 w-4" />
                    Create Board
                </Button>
            </div>

            <div className="flex items-center justify-between gap-4">
                <div className="relative flex-1 max-w-sm">
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                        placeholder="Search boards..."
                        className="pl-9"
                    />
                </div>
                <div className="flex items-center gap-2 bg-background border border-input rounded-md p-1">
                    <Button variant="ghost" size="icon" className="h-8 w-8 bg-muted">
                        <LayoutGrid className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8">
                        <List className="h-4 w-4 text-muted-foreground" />
                    </Button>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                {/* Mock Boards */}
                {[
                    { id: 1, name: "Product Launch v1.0", bg: "bg-blue-500/10", color: "text-blue-500", border: "border-blue-200" },
                    { id: 2, name: "Marketing Campaign", bg: "bg-purple-500/10", color: "text-purple-500", border: "border-purple-200" },
                    { id: 3, name: "Internal Operations", bg: "bg-green-500/10", color: "text-green-500", border: "border-green-200" },
                    { id: 4, name: "Q1 Hiring Plan", bg: "bg-orange-500/10", color: "text-orange-500", border: "border-orange-200" },
                    { id: 5, name: "Website Redesign", bg: "bg-pink-500/10", color: "text-pink-500", border: "border-pink-200" }
                ].map((board) => (
                    <Link to="/boards/$boardId" params={{ boardId: board.id.toString() }} key={board.id} className="block group">
                        <Card className="h-full hover:shadow-lg transition-all duration-300 border-l-4" style={{ borderLeftColor: `var(--color-${board.color.split('-')[1]}-500)` }}>
                            <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
                                <CardTitle className="text-lg font-bold group-hover:text-primary transition-colors">
                                    {board.name}
                                </CardTitle>
                                <Button variant="ghost" size="icon" className="h-8 w-8 -mt-1 -mr-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <MoreHorizontal className="h-4 w-4" />
                                </Button>
                            </CardHeader>
                            <CardContent className="pb-2">
                                <p className="text-sm text-muted-foreground line-clamp-2">
                                    Project description placeholder. This board is for managing the {board.name} tasks and milestones.
                                </p>
                            </CardContent>
                            <CardFooter className="flex flex-col gap-3 pt-4">
                                <div className="flex w-full justify-between text-xs text-muted-foreground">
                                    <span>4 Tasks</span>
                                    <span>0% Complete</span>
                                </div>
                                <div className="w-full bg-secondary h-1.5 rounded-full overflow-hidden">
                                    <div className="bg-primary h-full rounded-full w-[25%]" />
                                </div>
                                <div className="flex justify-between items-center w-full mt-2">
                                    <div className="flex -space-x-2">
                                        {[1, 2, 3].map(i => (
                                            <div key={i} className="h-6 w-6 rounded-full border-2 border-background bg-muted flex items-center justify-center text-[10px] font-bold">
                                                {i}
                                            </div>
                                        ))}
                                    </div>
                                    <span className="text-xs text-muted-foreground">Updated 2h ago</span>
                                </div>
                            </CardFooter>
                        </Card>
                    </Link>
                ))}

                {/* Add New Board Card */}
                <Button variant="outline" className="h-full min-h-[220px] flex flex-col gap-4 border-dashed border-2 hover:border-primary/50 hover:bg-muted/50 transition-all">
                    <div className="h-12 w-12 rounded-full bg-secondary flex items-center justify-center">
                        <Plus className="h-6 w-6 text-muted-foreground" />
                    </div>
                    <span className="text-lg font-medium text-muted-foreground">Create New Board</span>
                </Button>
            </div>
        </div>
    )
}
