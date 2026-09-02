import createClient, { type Client } from "@tracky/api-client"
import { useMemo } from "react"
import { fetchWithAuth } from "@tracky/web/lib/fetch-with-auth"

// API base URL - root since routes are at /api
const API_BASE_URL = "/"

/**
 * Hook to get an authenticated API client for making requests
 * Uses fetchWithAuth which handles Bearer token injection, 401 auto-retry with token refresh,
 * and credentials: include for httpOnly cookie support.
 * Returns the `api` level client since routes are nested under /api basePath
 */
export function useApi() {
  const client = useMemo(() => {
    const baseClient = createClient(API_BASE_URL, {
      fetch: fetchWithAuth,
    })
    // Return the api-level client since routes are registered under /api basePath
    return baseClient.api
  }, [])

  return client
}

/**
 * Type for the API client at the /api level
 */
export type ApiClient = Client["api"]
