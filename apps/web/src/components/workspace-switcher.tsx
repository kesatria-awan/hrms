import { Check, ChevronsUpDown, Building2, Loader2 } from "lucide-react"
import { useState } from "react"
import { useNavigate } from "@tanstack/react-router"
import { useQuery, useQueryClient } from "@tanstack/react-query"

import { cn } from "@tracky/web/lib/utils"
import { Button } from "@tracky/web/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@tracky/web/components/ui/dropdown-menu"
import { useApi } from "@tracky/web/hooks/use-api"
import { useAuth } from "@tracky/web/contexts/auth-context"
import { fetchWithAuth } from "@tracky/web/lib/fetch-with-auth"

interface WorkspaceSwitcherProps {
  expanded?: boolean
}

type Workspace = {
  id: string
  name: string
  slug: string
  role: string
}

export function WorkspaceSwitcher({ expanded = true }: WorkspaceSwitcherProps) {
  const api = useApi()
  const { isAuthenticated, login } = useAuth()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [isSwitching, setIsSwitching] = useState(false)

  const { data: currentWorkspace } = useQuery({
    queryKey: ["workspace", "current"],
    queryFn: async () => {
      const res = await api.auth.me.$get()
      if (!res.ok) return null
      const data = await res.json()
      return data.workspace ?? null
    },
    enabled: isAuthenticated,
  })

  const { data: workspacesData, isLoading } = useQuery({
    queryKey: ["auth", "my-workspaces"],
    queryFn: async () => {
      const res = await api.auth["my-workspaces"].$get()
      if (!res.ok) return { workspaces: [] }
      return res.json() as Promise<{ workspaces: Workspace[] }>
    },
    enabled: isAuthenticated,
  })

  const workspaces = workspacesData?.workspaces ?? []

  const handleWorkspaceSwitch = async (workspaceId: string) => {
    if (workspaceId === currentWorkspace?.id) return

    setIsSwitching(true)
    try {
      const res = await fetchWithAuth("/api/auth/switch-workspace", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceId }),
      })

      if (res.ok) {
        const data = (await res.json()) as { accessToken: string }
        login(data.accessToken)
        await queryClient.invalidateQueries()
        navigate({ to: "/tasks" })
      }
    } catch (error) {
      console.error("Failed to switch workspace:", error)
    } finally {
      setIsSwitching(false)
    }
  }

  if (isLoading) {
    return (
      <div className={cn(
        "flex items-center gap-2 px-2 py-1.5",
        !expanded && "justify-center px-0"
      )}>
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      </div>
    )
  }

  // If only one workspace, show simple display (no dropdown)
  if (workspaces.length <= 1) {
    return (
      <div className={cn(
        "flex items-center gap-2 px-2 py-1.5 rounded-md",
        !expanded && "justify-center px-0"
      )}>
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground">
          <Building2 className="h-4 w-4" />
        </div>
        {expanded && (
          <div className="flex flex-col min-w-0">
            <span className="text-sm font-semibold truncate">
              {currentWorkspace?.name ?? "Workspace"}
            </span>
            <span className="text-xs text-muted-foreground truncate">
              {workspaces.length} workspace
            </span>
          </div>
        )}
      </div>
    )
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          className={cn(
            "w-full justify-start gap-2 px-2 py-1.5 h-auto hover:bg-sidebar-accent",
            !expanded && "justify-center px-0 w-10"
          )}
          disabled={isSwitching}
        >
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground">
            {isSwitching ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Building2 className="h-4 w-4" />
            )}
          </div>
          {expanded && (
            <>
              <div className="flex flex-col items-start min-w-0 flex-1">
                <span className="text-sm font-semibold truncate max-w-[140px]">
                  {currentWorkspace?.name ?? "Select Workspace"}
                </span>
                <span className="text-xs text-muted-foreground">
                  {workspaces.length} workspaces
                </span>
              </div>
              <ChevronsUpDown className="h-4 w-4 shrink-0 text-muted-foreground" />
            </>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        className="w-[240px]"
        align="start"
        side="right"
        sideOffset={8}
      >
        <DropdownMenuLabel>Workspaces</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {workspaces.map((ws) => {
          const isActive = ws.id === currentWorkspace?.id
          return (
            <DropdownMenuItem
              key={ws.id}
              onClick={() => handleWorkspaceSwitch(ws.id)}
              className="flex items-center gap-2 cursor-pointer"
            >
              <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-muted">
                <Building2 className="h-3 w-3" />
              </div>
              <span className="flex-1 truncate">{ws.name}</span>
              {isActive && <Check className="h-4 w-4 text-primary" />}
            </DropdownMenuItem>
          )
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
