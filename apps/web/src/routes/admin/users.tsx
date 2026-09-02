import { createFileRoute } from "@tanstack/react-router"
import { useQuery } from "@tanstack/react-query"
import { useState, useEffect } from "react"
import { formatDistanceToNow } from "date-fns"
import {
  Search,
  Loader2,
  ChevronLeft,
  ChevronRight,
  Filter,
  X,
  AlertTriangle,
  Building2,
  Shield,
  Crown,
  User,
} from "lucide-react"
import { Button } from "@tracky/web/components/ui/button"
import { Badge } from "@tracky/web/components/ui/badge"
import { Input } from "@tracky/web/components/ui/input"
import { Label } from "@tracky/web/components/ui/label"
import { Avatar, AvatarFallback, AvatarImage } from "@tracky/web/components/ui/avatar"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@tracky/web/components/ui/card"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@tracky/web/components/ui/select"
import { useApi } from "@tracky/web/hooks/use-api"

export const Route = createFileRoute("/admin/users")({
  component: AdminUsersPage,
})

type AdminUser = {
  id: string
  email: string
  firstName: string | null
  lastName: string | null
  imageUrl: string | null
  role: string
  isSuperAdmin: boolean
  workspace: {
    id: string
    name: string
    slug: string
  } | null
  createdAt: number
  updatedAt: number
}

const PAGE_SIZE = 20

const ROLE_OPTIONS = [
  { value: "all", label: "All Roles" },
  { value: "super_admins", label: "Super Admins" },
  { value: "workspace_admin", label: "Workspace Admin" },
  { value: "member", label: "Member" },
]

function AdminUsersPage() {
  const api = useApi()
  const [page, setPage] = useState(0)
  const [roleFilter, setRoleFilter] = useState("all")
  const [searchQuery, setSearchQuery] = useState("")
  const [debouncedSearch, setDebouncedSearch] = useState("")

  // Debounce search with proper cleanup
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      if (searchQuery !== debouncedSearch) {
        setDebouncedSearch(searchQuery)
        setPage(0)
      }
    }, 300)
    return () => clearTimeout(timeoutId)
  }, [searchQuery, debouncedSearch])

  // Fetch users
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["admin", "users", page, roleFilter, debouncedSearch],
    queryFn: async () => {
      const query: Record<string, string> = {
        limit: String(PAGE_SIZE),
        offset: String(page * PAGE_SIZE),
      }
      if (roleFilter === "super_admins") {
        query.isSuperAdmin = "true"
      } else if (roleFilter !== "all") {
        query.role = roleFilter
      }
      if (debouncedSearch) {
        query.search = debouncedSearch
      }
      const response = await api.admin.users.$get({ query })
      if (!response.ok) {
        throw new Error("Failed to fetch users")
      }
      return response.json()
    },
  })

  const getRoleIcon = (role: string) => {
    switch (role) {
      case "workspace_admin":
        return <Shield className="h-4 w-4 text-primary" />
      default:
        return <User className="h-4 w-4 text-muted-foreground" />
    }
  }

  const getRoleLabel = (role: string) => {
    switch (role) {
      case "workspace_admin":
        return "Workspace Admin"
      default:
        return "Member"
    }
  }

  const getRoleBadgeStyle = (role: string) => {
    switch (role) {
      case "workspace_admin":
        return "bg-primary/10 text-primary"
      default:
        return ""
    }
  }

  const getUserName = (user: AdminUser) => {
    if (user.firstName || user.lastName) {
      return `${user.firstName || ""} ${user.lastName || ""}`.trim()
    }
    return user.email.split("@")[0]
  }

  const getUserInitials = (user: AdminUser) => {
    if (user.firstName && user.lastName) {
      return `${user.firstName[0]}${user.lastName[0]}`.toUpperCase()
    }
    return user.email[0].toUpperCase()
  }

  const totalPages = Math.ceil((data?.totalCount ?? 0) / PAGE_SIZE)

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <AlertTriangle className="h-12 w-12 text-destructive mx-auto mb-4" />
          <p className="text-destructive mb-4">Failed to load users</p>
          <Button onClick={() => refetch()}>Retry</Button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Users</h1>
          <p className="text-muted-foreground mt-1">
            View all users across the platform
          </p>
        </div>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="text-base flex items-center gap-2">
            <Filter className="h-4 w-4" />
            Filters
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-end gap-4">
            <div className="w-64">
              <Label className="text-xs text-muted-foreground mb-1 block">Search</Label>
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by email..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9"
                />
              </div>
            </div>
            <div className="w-48">
              <Label className="text-xs text-muted-foreground mb-1 block">Role</Label>
              <Select
                value={roleFilter}
                onValueChange={(value) => {
                  setRoleFilter(value)
                  setPage(0)
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ROLE_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {(roleFilter !== "all" || debouncedSearch) && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setRoleFilter("all")
                  setSearchQuery("")
                  setDebouncedSearch("")
                  setPage(0)
                }}
              >
                <X className="h-4 w-4 mr-1" />
                Clear Filters
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Users Table */}
      <Card>
        <CardHeader>
          <CardTitle>All Users</CardTitle>
          <CardDescription>
            {data?.totalCount} user{data?.totalCount !== 1 ? "s" : ""} total
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {data?.users.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">
              No users found
            </div>
          ) : (
            <div className="divide-y divide-border">
              {data?.users.map((user: AdminUser) => (
                <div
                  key={user.id}
                  className="flex items-center justify-between p-4 px-6 hover:bg-muted/50 transition-colors"
                >
                  <div className="flex items-center gap-4">
                    <Avatar className="h-10 w-10">
                      <AvatarImage src={user.imageUrl || undefined} />
                      <AvatarFallback>{getUserInitials(user)}</AvatarFallback>
                    </Avatar>
                    <div>
                      <div className="font-medium">{getUserName(user)}</div>
                      <div className="text-sm text-muted-foreground">{user.email}</div>
                    </div>
                  </div>

                  <div className="flex items-center gap-8">
                    <div className="flex items-center gap-2">
                      {user.isSuperAdmin && (
                        <Badge variant="secondary" className="bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                          <span className="mr-1"><Crown className="h-4 w-4 text-amber-500" /></span>
                          Super Admin
                        </Badge>
                      )}
                      <Badge variant="secondary" className={getRoleBadgeStyle(user.role)}>
                        <span className="mr-1">{getRoleIcon(user.role)}</span>
                        {getRoleLabel(user.role)}
                      </Badge>
                    </div>

                    {user.workspace ? (
                      <div className="flex items-center gap-2 text-sm text-muted-foreground w-48">
                        <Building2 className="h-4 w-4" />
                        <span className="truncate">{user.workspace.name}</span>
                      </div>
                    ) : (
                      <div className="text-sm text-muted-foreground w-48">
                        No workspace
                      </div>
                    )}

                    <span className="text-sm text-muted-foreground w-32 text-right">
                      {formatDistanceToNow(new Date(user.createdAt), { addSuffix: true })}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between p-4 border-t">
              <p className="text-sm text-muted-foreground">
                Showing {page * PAGE_SIZE + 1} to {Math.min((page + 1) * PAGE_SIZE, data?.totalCount ?? 0)} of {data?.totalCount} users
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage(p => p - 1)}
                  disabled={page === 0}
                >
                  <ChevronLeft className="h-4 w-4 mr-1" />
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage(p => p + 1)}
                  disabled={page >= totalPages - 1}
                >
                  Next
                  <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
