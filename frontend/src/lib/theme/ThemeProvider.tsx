// ═══════════════════════════════════════
// DSAT LMS v2 — Theme Provider
// Domain: UI
// Description: Light/dark toggle persisted to localStorage ('dsat-theme').
//   A blocking script in layout.tsx applies the class pre-paint (no FOUC);
//   this provider keeps React state in sync and exposes a toggle.
// ═══════════════════════════════════════

'use client'

import * as React from 'react'

type Theme = 'light' | 'dark'

interface ThemeContextValue {
  theme: Theme
  toggleTheme: () => void
  setTheme: (t: Theme) => void
}

const ThemeContext = React.createContext<ThemeContextValue | null>(null)

export const THEME_STORAGE_KEY = 'dsat-theme'

function applyTheme(theme: Theme) {
  const root = document.documentElement
  root.classList.toggle('dark', theme === 'dark')
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = React.useState<Theme>('light')

  React.useEffect(() => {
    const stored = (localStorage.getItem(THEME_STORAGE_KEY) as Theme | null) ?? null
    const initial: Theme =
      stored ?? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
    setThemeState(initial)
    applyTheme(initial)
  }, [])

  const setTheme = React.useCallback((t: Theme) => {
    setThemeState(t)
    applyTheme(t)
    localStorage.setItem(THEME_STORAGE_KEY, t)
  }, [])

  const toggleTheme = React.useCallback(() => {
    setTheme(theme === 'dark' ? 'light' : 'dark')
  }, [theme, setTheme])

  const value = React.useMemo(() => ({ theme, toggleTheme, setTheme }), [theme, toggleTheme, setTheme])

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme() {
  const ctx = React.useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme must be used within <ThemeProvider>')
  return ctx
}
