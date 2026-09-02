import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import { useApi } from "./use-api"

// Query keys
export const workspaceKeys = {
  settings: (slug: string) => ["workspace", slug, "settings"] as const,
  auditLogs: (slug: string, page?: number) => ["workspace", slug, "audit-logs", page] as const,
}

// Hook: Get workspace settings from auth/me cache
export function useWorkspaceSettings() {
  const api = useApi()

  return useQuery({
    queryKey: ["auth", "me"],
    queryFn: async () => {
      const response = await api.auth.me.$get()
      if (!response.ok) {
        throw new Error("Failed to fetch workspace settings")
      }
      return response.json()
    },
  })
}

// Hook: Update workspace settings
export function useUpdateWorkspaceSettings() {
  const api = useApi()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ slug, name, newSlug }: { slug: string; name?: string; newSlug?: string }) => {
      const response = await api.workspaces[":slug"].settings.$patch({
        param: { slug },
        json: { name, slug: newSlug },
      })
      if (!response.ok) {
        const error = await response.json()
        throw new Error((error as { message?: string }).message ?? "Failed to update settings")
      }
      return response.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["auth", "me"] })
    },
  })
}

// Hook: Create CHIP checkout session
export function useCreateCheckout() {
  const api = useApi()

  return useMutation({
    mutationFn: async ({ slug }: { slug: string }) => {
      const response = await api.workspaces[":slug"].billing.checkout.$post({
        param: { slug },
      })
      if (!response.ok) {
        const error = await response.json()
        throw new Error((error as { message?: string }).message ?? "Failed to create checkout")
      }
      return response.json()
    },
  })
}

// Hook: Cancel subscription
export function useCancelSubscription() {
  const api = useApi()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ slug }: { slug: string }) => {
      const response = await api.workspaces[":slug"].billing.cancel.$post({
        param: { slug },
      })
      if (!response.ok) {
        const error = await response.json()
        throw new Error((error as { message?: string }).message ?? "Failed to cancel subscription")
      }
      return response.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["auth", "me"] })
    },
  })
}

// Hook: Workspace audit logs
export function useWorkspaceAuditLogs(slug: string, options?: { page?: number; limit?: number }) {
  const api = useApi()
  const page = options?.page ?? 1
  const limit = options?.limit ?? 20

  return useQuery({
    queryKey: workspaceKeys.auditLogs(slug, page),
    queryFn: async () => {
      const response = await api.workspaces[":slug"]["audit-logs"].$get({
        param: { slug },
        query: { page: page.toString(), limit: limit.toString() },
      })
      if (!response.ok) {
        throw new Error("Failed to fetch audit logs")
      }
      return response.json()
    },
    enabled: !!slug,
  })
}
