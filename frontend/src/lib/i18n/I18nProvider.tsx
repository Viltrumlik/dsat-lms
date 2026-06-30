// Domain: i18n
// Description: Client i18n context. Holds the active locale, a setter that persists
//   to a cookie (so the server can pick it up next load), and t() for lookups with
//   {var} interpolation and an English fallback. No URL/locale routing.
'use client'

import * as React from 'react'
import { en } from './dictionaries/en'
import { uz } from './dictionaries/uz'
import { type Locale, LOCALE_COOKIE } from './config'

const DICTS: Record<Locale, typeof en> = { en, uz }

type Vars = Record<string, string | number>

interface I18nContextValue {
  locale: Locale
  setLocale: (locale: Locale) => void
  t: (key: string, vars?: Vars) => string
}

const I18nContext = React.createContext<I18nContextValue | null>(null)

function resolve(dict: unknown, key: string): unknown {
  return key.split('.').reduce<unknown>((acc, part) => {
    if (acc && typeof acc === 'object' && part in (acc as object)) {
      return (acc as Record<string, unknown>)[part]
    }
    return undefined
  }, dict)
}

function interpolate(template: string, vars?: Vars): string {
  if (!vars) return template
  return template.replace(/\{(\w+)\}/g, (_, k: string) =>
    k in vars ? String(vars[k]) : `{${k}}`
  )
}

export function I18nProvider({
  initialLocale,
  children,
}: {
  initialLocale: Locale
  children: React.ReactNode
}) {
  const [locale, setLocaleState] = React.useState<Locale>(initialLocale)

  const setLocale = React.useCallback((next: Locale) => {
    setLocaleState(next)
    // 1 year, lax — readable by the server on the next request to avoid a flash.
    document.cookie = `${LOCALE_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`
    document.documentElement.lang = next
  }, [])

  const t = React.useCallback(
    (key: string, vars?: Vars): string => {
      const hit = resolve(DICTS[locale], key) ?? resolve(en, key)
      if (typeof hit !== 'string') {
        if (process.env.NODE_ENV !== 'production') {
          // eslint-disable-next-line no-console
          console.warn(`[i18n] missing translation key: "${key}"`)
        }
        return key
      }
      return interpolate(hit, vars)
    },
    [locale]
  )

  const value = React.useMemo<I18nContextValue>(
    () => ({ locale, setLocale, t }),
    [locale, setLocale, t]
  )

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

export function useI18n(): I18nContextValue {
  const ctx = React.useContext(I18nContext)
  if (!ctx) throw new Error('useI18n must be used within <I18nProvider>')
  return ctx
}

/** Convenience: just the translate function. */
export function useT(): I18nContextValue['t'] {
  return useI18n().t
}

/**
 * Locale-aware plural: English switches on count; Uzbek keeps the noun singular
 * after a number (e.g. "2 boʻlim", not "2 boʻlimlar").
 */
export function plural(locale: Locale, count: number, one: string, other: string): string {
  if (locale === 'uz') return one
  return count === 1 ? one : other
}
