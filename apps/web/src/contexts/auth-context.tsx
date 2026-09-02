import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from "react"
import { authManager } from "@tracky/web/lib/auth-manager"

type AuthUser = {
  id: string
  email: string
  role: string
}

type AuthContextValue = {
  user: AuthUser | null
  isAuthenticated: boolean
  isVerified: boolean
  isLoading: boolean
  login: (accessToken: string) => void
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

function decodeJwtPayload(token: string): { sub: string; email: string; role: string; emailVerifiedAt: number | null } {
  const [, payloadB64] = token.split(".")
  const json = atob(payloadB64.replace(/-/g, "+").replace(/_/g, "/"))
  return JSON.parse(json) as { sub: string; email: string; role: string; emailVerifiedAt: number | null }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [isVerified, setIsVerified] = useState(false)
  const [isLoading, setIsLoading] = useState(true)

  // D-18: On app load, call refresh to hydrate from httpOnly cookie
  useEffect(() => {
    authManager
      .refresh()
      .then((token) => {
        if (token) {
          const payload = decodeJwtPayload(token)
          setUser({ id: payload.sub, email: payload.email, role: payload.role })
          setIsVerified(payload.emailVerifiedAt !== null && payload.emailVerifiedAt !== undefined)
        }
      })
      .finally(() => setIsLoading(false))
  }, [])

  const login = useCallback((accessToken: string) => {
    authManager.setToken(accessToken)
    const payload = decodeJwtPayload(accessToken)
    setUser({ id: payload.sub, email: payload.email, role: payload.role })
    setIsVerified(payload.emailVerifiedAt !== null && payload.emailVerifiedAt !== undefined)
  }, [])

  const logout = useCallback(async () => {
    await fetch("/api/auth/logout", { method: "POST", credentials: "include" })
    authManager.clearToken()
    setUser(null)
    setIsVerified(false)
  }, [])

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: user !== null,
        isVerified,
        isLoading,
        login,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error("useAuth must be used within AuthProvider")
  return ctx
}
