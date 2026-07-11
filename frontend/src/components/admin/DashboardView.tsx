// Domain: Analytics (admin)
// Description: The executive control center — the /admin landing page. Action-first:
//   the alerts center leads, then platform KPIs, a "today" strip, and a daily trend +
//   recent-activity feed. Backed by GET /admin/dashboard/ (IsAdmin).
'use client'

import * as React from 'react'
import dynamic from 'next/dynamic'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  CalendarClock,
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  FileCheck2,
  FileClock,
  GraduationCap,
  RefreshCw,
  School,
  Star,
  UserPlus,
  Users,
} from 'lucide-react'
import { adminDashboardAPI } from '@/lib/api/admin/dashboard'
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
import { AlertsCenter } from './AlertsCenter'
import { RecentActivityFeed } from './RecentActivityFeed'

const TrendChart = dynamic(() => import('./DashboardTrendChart'), {
  ssr: false,
  loading: () => <div className="h-64 animate-pulse rounded-lg bg-muted" />,
})

export function DashboardView() {
  const t = useT()
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const [days, setDays] = React.useState(30)

  const query = useQuery({
    queryKey: ['admin', 'dashboard', days],
    queryFn: () => adminDashboardAPI.overview(days),
  })

  const rebuild = useMutation({
    mutationFn: () => adminDashboardAPI.rebuild(days),
    onSuccess: (data) => {
      queryClient.setQueryData(['admin', 'dashboard', days], data)
      toast({ variant: 'success', title: t('admin.dashboard.rebuilt') })
    },
    onError: (err) => toast({ variant: 'error', title: parseApiError(err).message }),
  })

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t('admin.dashboard.title')}</h1>
          <p className="text-muted-foreground">{t('admin.dashboard.subtitle')}</p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={String(days)} onValueChange={(v) => setDays(Number(v))}>
            <SelectTrigger className="w-36" aria-label={t('admin.dashboard.window')}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7">{t('admin.dashboard.days', { n: 7 })}</SelectItem>
              <SelectItem value="30">{t('admin.dashboard.days', { n: 30 })}</SelectItem>
              <SelectItem value="90">{t('admin.dashboard.days', { n: 90 })}</SelectItem>
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            size="sm"
            loading={rebuild.isPending}
            onClick={() => rebuild.mutate()}
          >
            <RefreshCw className="h-4 w-4" /> {t('admin.dashboard.rebuild')}
          </Button>
        </div>
      </div>

      {query.isLoading && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-24 animate-pulse rounded-xl bg-muted" />
          ))}
        </div>
      )}

      {query.isError && (
        <Card>
          <CardContent className="flex flex-wrap items-center justify-between gap-3 p-5 text-sm text-muted-foreground">
            {t('admin.dashboard.loadFailed')}
            <Button variant="outline" size="sm" onClick={() => query.refetch()}>
              {t('common.tryAgain')}
            </Button>
          </CardContent>
        </Card>
      )}

      {query.data && (
        <>
          {/* Action center first */}
          <AlertsCenter alerts={query.data.alerts} />

          {/* Executive KPIs */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <StatCard
              label={t('admin.dashboard.kpi.students')}
              value={String(query.data.kpis.totalStudents)}
              icon={Users}
            />
            <StatCard
              label={t('admin.dashboard.kpi.teachers')}
              value={String(query.data.kpis.totalTeachers)}
              icon={GraduationCap}
            />
            <StatCard
              label={t('admin.dashboard.kpi.classes')}
              value={String(query.data.kpis.activeClasses)}
              icon={School}
            />
            <StatCard
              label={t('admin.dashboard.kpi.upcomingExams')}
              value={String(query.data.kpis.upcomingExams)}
              icon={ClipboardList}
            />
            <StatCard
              label={t('admin.dashboard.kpi.completionRate')}
              value={
                query.data.kpis.completionRate === null
                  ? '—'
                  : `${query.data.kpis.completionRate}%`
              }
              icon={CheckCircle2}
            />
            <StatCard
              label={t('admin.dashboard.kpi.satisfaction')}
              value={
                query.data.kpis.satisfaction === null
                  ? '—'
                  : query.data.kpis.satisfaction.toFixed(1)
              }
              icon={Star}
            />
          </div>

          {/* Today */}
          <div className="space-y-3">
            <h2 className="text-lg font-semibold">{t('admin.dashboard.today')}</h2>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
              <StatCard
                label={t('admin.dashboard.todayKpi.newRegistrations')}
                value={String(query.data.today.newRegistrations)}
                icon={UserPlus}
              />
              <StatCard
                label={t('admin.dashboard.todayKpi.homeworkDue')}
                value={String(query.data.today.homeworkDue)}
                icon={FileClock}
              />
              <StatCard
                label={t('admin.dashboard.todayKpi.homeworkSubmitted')}
                value={String(query.data.today.homeworkSubmitted)}
                icon={FileCheck2}
              />
              <StatCard
                label={t('admin.dashboard.todayKpi.bookings')}
                value={String(query.data.today.bookings)}
                icon={CalendarClock}
              />
              <StatCard
                label={t('admin.dashboard.todayKpi.upcomingExamsWeek')}
                value={String(query.data.today.upcomingExamsWeek)}
                icon={CalendarDays}
              />
            </div>
          </div>

          {/* Trend + recent activity */}
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardContent className="space-y-3 p-5">
                <h2 className="text-lg font-semibold">{t('admin.dashboard.activityTrend')}</h2>
                <TrendChart trends={query.data.trends} />
              </CardContent>
            </Card>
            <RecentActivityFeed items={query.data.recentActivity} />
          </div>
        </>
      )}
    </div>
  )
}
