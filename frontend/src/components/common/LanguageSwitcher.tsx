// Domain: Common
// Description: Compact language toggle (EN ↔ UZ). Persists via the i18n cookie;
//   text updates live (no reload). Grows into a dropdown if more locales are added.
'use client'

import { Languages } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useI18n } from '@/lib/i18n/I18nProvider'
import { LOCALE_SHORT, type Locale } from '@/lib/i18n/config'

export function LanguageSwitcher() {
  const { locale, setLocale, t } = useI18n()
  const next: Locale = locale === 'en' ? 'uz' : 'en'

  return (
    <Button
      variant="ghost"
      size="sm"
      className="gap-1.5 px-2"
      aria-label={t('common.switchLanguage')}
      title={t('common.switchLanguage')}
      onClick={() => setLocale(next)}
    >
      <Languages className="h-4 w-4" />
      <span className="text-xs font-semibold tabular-nums">{LOCALE_SHORT[locale]}</span>
    </Button>
  )
}
