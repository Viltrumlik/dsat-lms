// Domain: Support
// Description: Support Center landing (S0 skeleton). A "coming soon" placeholder
//   so the nav entry resolves; the feature surfaces (book a teacher, ask a
//   question, office hours, proactive recommendations) land in later slices.
'use client'

import { LifeBuoy } from 'lucide-react'
import { useT } from '@/lib/i18n/I18nProvider'
import { Card, CardContent } from '@/components/ui/card'

export default function SupportPage() {
  const t = useT()
  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t('support.title')}</h1>
        <p className="text-muted-foreground">{t('support.subtitle')}</p>
      </div>
      <Card>
        <CardContent className="flex flex-col items-center gap-4 py-16 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary-50 text-primary-700 dark:bg-primary-800/40 dark:text-primary-100">
            <LifeBuoy className="h-7 w-7" />
          </div>
          <span className="rounded-full bg-muted px-3 py-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {t('support.comingSoonTag')}
          </span>
          <h2 className="text-lg font-semibold">{t('support.comingSoonTitle')}</h2>
          <p className="max-w-md text-sm text-muted-foreground">{t('support.comingSoonBody')}</p>
        </CardContent>
      </Card>
    </div>
  )
}
