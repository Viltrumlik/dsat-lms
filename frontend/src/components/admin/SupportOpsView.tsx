// Domain: Support (admin)
// Description: The admin ops dashboard — platform-wide Support KPIs (bookings,
//   tickets, office hours, the proactive-trigger funnel), a bookings-by-status
//   breakdown, and a daily activity trend. A day-window selector + a Rebuild
//   button (regenerates today's rollup on demand). IsAdmin server-side.
'use client'

import * as React from 'react'
import dynamic from 'next/dynamic'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  CalendarClock,
  CheckCircle2,
  Clock,
  MessageSquare,
  RefreshCw,
  Sparkles,
  Star,
  Users,
} from 'lucide-react'
import { adminSupportOpsAPI } from '@/lib/api/admin/support-ops'
import { parseApiError } from '@/lib/api/errors'
import { useT } from '@/lib/i18n/I18nProvider'
import { useToast } from '@/components/ui/toast'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { StatCard } from '@/components/ui/stat-card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

const BookingsChart = dynamic(() => import('@/components/support/SupportBookingsChart'), {
  ssr: false,
  loading: () => <div className="h-56 animate-pulse rounded-lg bg-muted" />,
})
const TrendChart = dynamic(() => import('./SupportOpsTrendChart'), {
  ssr: false,
  loading: () => <div className="h-64 animate-pulse rounded-lg bg-muted" />,
})

const ratioPct = (v: number | null) => (v === null ? '—' : `${Math.round(v * 100)}%`)
const minutes = (v: number | null) => (v === null ? '—' : `${Math.round(v)}m`)
const rating = (v: number | null) => (v === null ? '—' : v.toFixed(1))

export function SupportOpsView() {
  const t = useT()
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const [days, setDays] = React.useState(30)

  const query = useQuery({
    queryKey: ['admin', 'support-ops', days],
    queryFn: () => adminSupportOpsAPI.overview(days),
  })

  const rebuild = useMutation({
    mutationFn: () => adminSupportOpsAPI.rebuild(days),
    onSuccess: (data) => {
      queryClient.setQueryData(['admin', 'support-ops', days], data)
      toast({ variant: 'success', title: t('admin.supportOps.rebuilt') })
    },
    onError: (err) => toast({ variant: 'error', title: parseApiError(err).message }),
  })

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t('admin.supportOps.title')}</h1>
          <p className="text-muted-foreground">{t('admin.supportOps.subtitle')}</p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={String(days)} onValueChange={(v) => setDays(Number(v))}>
            <SelectTrigger className="w-36" aria-label={t('admin.supportOps.window')}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7">{t('admin.supportOps.days', { n: 7 })}</SelectItem>
              <SelectItem value="30">{t('admin.supportOps.days', { n: 30 })}</SelectItem>
              <SelectItem value="90">{t('admin.supportOps.days', { n: 90 })}</SelectItem>
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            size="sm"
            loading={rebuild.isPending}
            onClick={() => rebuild.mutate()}
          >
            <RefreshCw className="h-4 w-4" /> {t('admin.supportOps.rebuild')}
          </Button>
        </div>
      </div>

      {query.isLoading && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-24 animate-pulse rounded-xl bg-muted" />
          ))}
        </div>
      )}

      {query.isError && (
        <Card>
          <CardContent className="flex flex-wrap items-center justify-between gap-3 p-5 text-sm text-muted-foreground">
            {t('admin.supportOps.loadFailed')}
            <Button variant="outline" size="sm" onClick={() => query.refetch()}>
              {t('common.tryAgain')}
            </Button>
          </CardContent>
        </Card>
      )}

      {query.data && (
        <>
          {(() => {
            const s = query.data.summary
            return (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <StatCard
                  label={t('admin.supportOps.kpi.bookings')}
                  value={String(s.bookings.total)}
                  icon={CalendarClock}
                  hint={t('admin.supportOps.kpi.pendingHint', { n: s.bookings.byStatus.pending })}
                />
                <StatCard
                  label={t('admin.supportOps.kpi.noShowRate')}
                  value={ratioPct(s.bookings.noShowRate)}
                  icon={Users}
                />
                <StatCard
                  label={t('admin.supportOps.kpi.avgRating')}
                  value={rating(s.bookings.avgRating)}
                  icon={Star}
                  hint={t('admin.supportOps.kpi.avgWaitHint', {
                    v: minutes(s.bookings.avgWaitMinutes),
                  })}
                />
                <StatCard
                  label={t('admin.supportOps.kpi.openTickets')}
                  value={String(s.tickets.open)}
                  icon={MessageSquare}
                  hint={t('admin.supportOps.kpi.ticketsTotalHint', { n: s.tickets.total })}
                />
                <StatCard
                  label={t('admin.supportOps.kpi.ticketResponse')}
                  value={minutes(s.tickets.avgResponseMinutes)}
                  icon={Clock}
                />
                <StatCard
                  label={t('admin.supportOps.kpi.upcomingOfficeHours')}
                  value={String(s.officeHours.upcomingSessions)}
                  icon={CalendarClock}
                  hint={t('admin.supportOps.kpi.attendedHint', { n: s.officeHours.totalAttended })}
                />
                <StatCard
                  label={t('admin.supportOps.kpi.recommendations')}
                  value={String(s.recommendations.total)}
                  icon={Sparkles}
                  hint={t('admin.supportOps.kpi.actedHint', {
                    n: s.recommendations.byStatus.acted,
                  })}
                />
                <StatCard
                  label={t('admin.supportOps.kpi.completedBookings')}
                  value={String(s.bookings.completed)}
                  icon={CheckCircle2}
                />
              </div>
            )
          })()}

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardContent className="space-y-3 p-5">
                <h2 className="text-lg font-semibold">{t('admin.supportOps.bookingsByStatus')}</h2>
                <BookingsChart byStatus={query.data.summary.bookings.byStatus} />
              </CardContent>
            </Card>
            <Card>
              <CardContent className="space-y-3 p-5">
                <h2 className="text-lg font-semibold">{t('admin.supportOps.activityTrend')}</h2>
                <TrendChart daily={query.data.daily} />
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  )
}
