// Domain: Support (staff)
// Description: Support KPI overview — booking + ticket metrics (own vs. all scope)
//   with a lazy bookings-by-status chart.
'use client'

import dynamic from 'next/dynamic'
import { useQuery } from '@tanstack/react-query'
import { supportAnalyticsAPI } from '@/lib/api/support-analytics'
import { useT } from '@/lib/i18n/I18nProvider'
import { Card, CardContent } from '@/components/ui/card'

const Chart = dynamic(() => import('./SupportBookingsChart'), {
  ssr: false,
  loading: () => <div className="h-56 animate-pulse rounded-lg bg-muted" />,
})

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-2xl font-bold tabular-nums">{value}</p>
        <p className="text-xs text-muted-foreground">{label}</p>
      </CardContent>
    </Card>
  )
}

export function StaffSupportAnalytics() {
  const t = useT()
  const { data, isLoading, isError } = useQuery({
    queryKey: ['support', 'staff-analytics'],
    queryFn: supportAnalyticsAPI.staff,
  })

  if (isLoading) {
    return (
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-20 animate-pulse rounded-lg bg-muted" />
        ))}
      </div>
    )
  }
  if (isError || !data) {
    return (
      <Card>
        <CardContent className="p-5 text-sm text-muted-foreground">
          {t('support.analytics.loadFailed')}
        </CardContent>
      </Card>
    )
  }

  const na = t('support.analytics.na')
  const pct = (v: number | null) => (v == null ? na : `${Math.round(v * 100)}%`)
  const rating = (v: number | null) => (v == null ? na : `${v.toFixed(1)}★`)
  const mins = (v: number | null) => (v == null ? na : t('support.analytics.minutesUnit', { n: Math.round(v) }))

  const b = data.bookings
  const tk = data.tickets

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Stat label={t('support.analytics.sessions')} value={String(b.total)} />
        <Stat label={t('support.analytics.completed')} value={String(b.completed)} />
        <Stat label={t('support.analytics.noShowRate')} value={pct(b.noShowRate)} />
        <Stat label={t('support.analytics.avgRating')} value={rating(b.avgRating)} />
        <Stat label={t('support.analytics.avgWait')} value={mins(b.avgWaitMinutes)} />
        {data.scope === 'own' && (
          <Stat label={t('support.analytics.utilization')} value={pct(b.utilization)} />
        )}
      </div>

      <Card>
        <CardContent className="p-5">
          <p className="mb-4 text-sm font-medium">{t('support.analytics.byStatusTitle')}</p>
          <Chart byStatus={b.byStatus} />
        </CardContent>
      </Card>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label={t('support.analytics.ticketsOpen')} value={String(tk.open)} />
        <Stat label={t('support.analytics.ticketsAnswered')} value={String(tk.answered)} />
        <Stat label={t('support.analytics.avgResponse')} value={mins(tk.avgResponseMinutes)} />
        {data.scope === 'own' && tk.answeredByMe != null && (
          <Stat label={t('support.analytics.answeredByMe')} value={String(tk.answeredByMe)} />
        )}
      </div>
    </div>
  )
}
