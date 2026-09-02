import { QueryClientProvider } from "@tanstack/react-query"
import { ReactQueryDevtools } from "@tanstack/react-query-devtools"
import { createRootRoute, Outlet } from "@tanstack/react-router"
import { TanStackRouterDevtools } from "@tanstack/react-router-devtools"
import { Toaster } from "@tracky/web/components/ui/sonner"
import { AuthProvider } from "@tracky/web/contexts/auth-context"
import { queryClient } from "@tracky/web/lib/query-client"

export const Route = createRootRoute({
  component: RootComponent,
})

function RootComponent() {
  return (
    <AuthProvider>
      <QueryClientProvider client={queryClient}>
        <Outlet />
        <Toaster />
        <ReactQueryDevtools initialIsOpen={false} />
        <TanStackRouterDevtools />
      </QueryClientProvider>
    </AuthProvider>
  )
}
