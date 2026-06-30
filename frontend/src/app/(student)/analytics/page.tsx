// Domain: Analytics
// Description: Student analytics — overall summary, per-topic accuracy, leaderboard.
'use client'

import { useT } from '@/lib/i18n/I18nProvider'
import { SummaryCards } from '@/components/dashboard/SummaryCards'
import { CategoryMastery } from '@/components/analytics/CategoryMastery'
import { Rankings } from '@/components/analytics/Rankings'

export default function AnalyticsPage() {
  const t = useT()
  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t('analytics.title')}</h1>
        <p className="text-muted-foreground">{t('analytics.subtitle')}</p>
      </div>
      <SummaryCards />
      <CategoryMastery />
      <Rankings />
    </div>
  )
}
