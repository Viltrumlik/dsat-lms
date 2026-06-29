// Domain: Student / Analytics
// Description: Top-line stats for the dashboard.
'use client'

import { useQuery } from '@tanstack/react-query'
import { Activity, CheckCircle2, Target, Trophy } from 'lucide-react'
import { analyticsAPI } from '@/lib/api/analytics'
import { useT } from '@/lib/i18n/I18nProvider'
import { Card, CardContent } from '@/components/ui/card'
import { pct } from '@/lib/utils/num'

function StatCard({
  label,
  value,
  icon: Icon,
}: {
  label: string
  value: string
  icon: React.ComponentType<{ className?: string }>
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-4 p-5">
        <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-primary-50 text-primary-700 dark:bg-primary-800/40 dark:text-primary-100">
          <Icon className="h-5 w-5" />
        </span>
        <div>
          <p className="text-2xl font-bold leading-tight">{value}</p>
          <p className="text-sm text-muted-foreground">{label}</p>
        </div>
      </CardContent>
    </Card>
  )
}

export function SummaryCards() {
  const t = useT()
  const { data, isLoading, isError } = useQuery({
    queryKey: ['analytics', 'summary'],
    queryFn: analyticsAPI.summary,
  })

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i}>
            <CardContent className="flex items-center gap-4 p-5">
              <div className="h-11 w-11 animate-pulse rounded-lg bg-muted" />
              <div className="space-y-2">
                <div className="h-6 w-12 animate-pulse rounded bg-muted" />
                <div className="h-4 w-20 animate-pulse rounded bg-muted" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    )
  }

  if (isError || !data) {
    return (
      <Card>
        <CardContent className="p-5 text-sm text-muted-foreground">
          {t('dashboard.summary.failed')}
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <StatCard
        label={t('dashboard.summary.questionsAnswered')}
        value={String(data.totalAnswered)}
        icon={Activity}
      />
      <StatCard
        label={t('dashboard.summary.overallAccuracy')}
        value={pct(data.overallAccuracy)}
        icon={Target}
      />
      <StatCard
        label={t('dashboard.summary.testsCompleted')}
        value={String(data.examsCompleted)}
        icon={CheckCircle2}
      />
      <StatCard
        label={t('dashboard.summary.bestTestAccuracy')}
        value={data.bestExamAccuracy === null ? '—' : pct(data.bestExamAccuracy)}
        icon={Trophy}
      />
    </div>
  )
}
