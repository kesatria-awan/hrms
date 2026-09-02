import { authManager } from "./auth-manager"

export async function fetchWithAuth(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  const token = authManager.getToken()
  const headers = new Headers(init?.headers)
  if (token) {
    headers.set("Authorization", `Bearer ${token}`)
  }

  let res = await fetch(input, { ...init, headers, credentials: "include" })

  // Auto-refresh on 401 (expired token) and retry once (per D-17)
  // NOTE: 401 = Unauthorized (expired/invalid token), NOT 403 (Forbidden/access denied)
  if (res.status === 401) {
    const newToken = await authManager.refresh()
    if (newToken) {
      headers.set("Authorization", `Bearer ${newToken}`)
      res = await fetch(input, { ...init, headers, credentials: "include" })
    }
  }

  return res
}
