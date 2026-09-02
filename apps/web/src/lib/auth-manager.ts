class AuthManager {
  private accessToken: string | null = null

  getToken(): string | null {
    return this.accessToken
  }

  setToken(token: string): void {
    this.accessToken = token
  }

  clearToken(): void {
    this.accessToken = null
  }

  async refresh(): Promise<string | null> {
    try {
      const res = await fetch("/api/auth/refresh", {
        method: "POST",
        credentials: "include", // CRITICAL: sends httpOnly cookie
      })
      if (!res.ok) return null
      const data: { accessToken: string } = await res.json()
      this.accessToken = data.accessToken
      return data.accessToken
    } catch {
      return null
    }
  }
}

export const authManager = new AuthManager()
