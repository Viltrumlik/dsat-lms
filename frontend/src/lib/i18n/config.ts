// Domain: i18n
// Description: Locale constants shared by the provider, layout (SSR cookie read),
//   and the language switcher. English is the default; Uzbek is opt-in.
export const LOCALES = ['en', 'uz'] as const
export type Locale = (typeof LOCALES)[number]

export const DEFAULT_LOCALE: Locale = 'en'
export const LOCALE_COOKIE = 'dsat-locale'

export const LOCALE_LABELS: Record<Locale, string> = {
  en: 'English',
  uz: "O'zbekcha",
}

/** Short code shown in the compact switcher. */
export const LOCALE_SHORT: Record<Locale, string> = {
  en: 'EN',
  uz: 'UZ',
}

export function isLocale(value: string | undefined | null): value is Locale {
  return value === 'en' || value === 'uz'
}
