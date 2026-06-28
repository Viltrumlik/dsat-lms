// ═══════════════════════════════════════
// DSAT LMS v2 — Auth Provider (Context)
// Domain: Identity
// Description: Holds the current user + in-memory access token. On load it
//   restores the session from the HttpOnly refresh cookie (refresh → me).
//   `setAccessToken` (client.ts) keeps the axios default header in sync.
// ═══════════════════════════════════════

'use client'

import * as React from 'react'
import { setAccessToken } from '@/lib/api/client'
import { authAPI, type RegisterPayload } from '@/lib/api/auth'
import type { User } from '@/types'

interface AuthContextValue {
  user: User | null
  isLoading: boolean // initial session bootstrap
  isAuthenticated: boolean
  login: (email: string, password: string) => Promise<User>
  register: (payload: RegisterPayload) => Promise<User>
  logout: () => Promise<void>
  refreshUser: () => Promise<void>
  setUser: (user: User | null) => void
}

const AuthContext = React.createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = React.useState<User | null>(null)
  const [isLoading, setIsLoading] = React.useState(true)
  const bootstrapped = React.useRef(false)

  // Bootstrap: try to restore a session via the refresh cookie. Guarded by a ref
  // so it runs exactly once — refresh tokens rotate, so two concurrent refreshes
  // (e.g. StrictMode's double-invoke) would race and blacklist each other.
  React.useEffect(() => {
    if (bootstrapped.current) return
    bootstrapped.current = true
    ;(async () => {
      try {
        const { accessToken } = await authAPI.refresh()
        setAccessToken(accessToken)
        const { user: me } = await authAPI.me()
        setUser(me)
      } catch {
        setAccessToken(null)
        setUser(null)
      } finally {
        setIsLoading(false)
      }
    })()
  }, [])

  const login = React.useCallback(async (email: string, password: string) => {
    const { user: u, accessToken } = await authAPI.login({ email, password })
    setAccessToken(accessToken)
    setUser(u)
    return u
  }, [])

  const register = React.useCallback(async (payload: RegisterPayload) => {
    const { user: u, accessToken } = await authAPI.register(payload)
    setAccessToken(accessToken)
    setUser(u)
    return u
  }, [])

  const logout = React.useCallback(async () => {
    try {
      await authAPI.logout()
    } catch {
      // best-effort — clear local state regardless
    }
    setAccessToken(null)
    setUser(null)
  }, [])

  const refreshUser = React.useCallback(async () => {
    const { user: me } = await authAPI.me()
    setUser(me)
  }, [])

  const value = React.useMemo<AuthContextValue>(
    () => ({
      user,
      isLoading,
      isAuthenticated: user !== null,
      login,
      register,
      logout,
      refreshUser,
      setUser,
    }),
    [user, isLoading, login, register, logout, refreshUser]
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = React.useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within <AuthProvider>')
  return ctx
}
