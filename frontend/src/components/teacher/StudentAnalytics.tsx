// Domain: Academy (teacher)
// Description: Read-only per-student analytics drilldown — summary stats + per-topic
//   accuracy (lazy chart + list). Reuses the analytics chart; data is scoped
//   server-side to the teacher's own students.
'use client'

import * as React from 'react'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import {
  Activity,
  ArrowLeft,
  BarChart3,
  CheckCircle2,
  ClipboardList,
  Gauge,
  Minus,
  Target,
  TrendingDown,
  TrendingUp,
  Trophy,
} from 'lucide-react'
import { teacherAPI } from '@/lib/api/teacher'
import { useT } from '@/lib/i18n/I18nProvider'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { num, pct } from '@/lib/utils/num'
import type { TrendDirection } from '@/types'
import { RiskBadge, useReasonText } from './RiskBadge'

const Chart = dynamic(() => import('@/components/analytics/AccuracyByCategoryChart'), {
  ssr: false,
  loading: () => <div className="h-48 animate-pulse rounded-lg bg-muted" />,
})

const TREND_ICON: Record<TrendDirection, React.ComponentType<{ className?: string }>> = {
  up: TrendingUp,
  down: TrendingDown,
  flat: Minus,
  insufficient_data: Minus,
}

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

export function StudentAnalytics({ studentId, backHref }: { studentId: string; backHref: string }) {
  const t = useT()
  const reasonText = useReasonText()
  const { data, isLoading, isError } = useQuery({
    queryKey: ['teacher', 'student-analytics', studentId],
    queryFn: () => teacherAPI.studentAnalytics(studentId),
  })

  return (
    <div className="space-y-6">
      <Link
        href={backHref}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> {t('teacher.studentAnalytics.back')}
      </Link>

      {isLoading && <div className="h-64 animate-pulse rounded-xl bg-muted" />}

      {isError && (
        <Card>
          <CardContent className="p-5 text-sm text-muted-foreground">
            {t('teacher.studentAnalytics.loadFailed')}
          </CardContent>
        </Card>
      )}

      {data && (
        <>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">
              {data.student.fullName || data.student.email}
            </h1>
            <p className="text-muted-foreground">{t('teacher.studentAnalytics.subtitle')}</p>
          </div>

          <Card>
            <CardContent className="flex flex-wrap items-center gap-3 p-5">
              <RiskBadge level={data.riskAssessment.level} />
              {data.riskAssessment.reasons.length > 0 && (
                <p className="text-sm text-muted-foreground">
                  {data.riskAssessment.reasons.map(reasonText).join(', ')}
                </p>
              )}
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              label={t('dashboard.summary.questionsAnswered')}
              value={String(data.summary.totalAnswered)}
              icon={Activity}
            />
            <StatCard
              label={t('dashboard.summary.overallAccuracy')}
              value={pct(data.summary.overallAccuracy)}
              icon={Target}
            />
            <StatCard
              label={t('dashboard.summary.testsCompleted')}
              value={String(data.summary.examsCompleted)}
              icon={CheckCircle2}
            />
            <StatCard
              label={t('dashboard.summary.bestTestAccuracy')}
              value={data.summary.bestExamAccuracy === null ? '—' : pct(data.summary.bestExamAccuracy)}
              icon={Trophy}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <Card>
              <CardContent className="space-y-1 p-5">
                <p className="flex items-center gap-2 text-sm text-muted-foreground">
                  <ClipboardList className="h-4 w-4" /> {t('teacher.insights.homework.title')}
                </p>
                <p className="text-2xl font-bold tabular-nums">
                  {pct(data.homeworkStats.completionPct)}
                </p>
                <p className="text-xs text-muted-foreground">
                  {t('teacher.insights.homework.submittedOf', {
                    done: data.homeworkStats.submitted,
                    total: data.homeworkStats.assigned,
                  })}
                  {data.homeworkStats.overdueIncomplete > 0 &&
                    ` · ${t('teacher.insights.homework.overdue', {
                      count: data.homeworkStats.overdueIncomplete,
                    })}`}
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="space-y-1 p-5">
                <p className="flex items-center gap-2 text-sm text-muted-foreground">
                  {React.createElement(TREND_ICON[data.improvementTrend.trend], {
                    className: 'h-4 w-4',
                  })}{' '}
                  {t('teacher.insights.trend.title')}
                </p>
                <p className="text-2xl font-bold">
                  {t(`teacher.insights.trend.${data.improvementTrend.trend}`)}
                </p>
                <p className="text-xs text-muted-foreground">
                  {data.improvementTrend.deltaPct === null
                    ? '—'
                    : t('teacher.insights.trend.delta', {
                        value:
                          data.improvementTrend.deltaPct > 0
                            ? `+${data.improvementTrend.deltaPct}`
                            : data.improvementTrend.deltaPct,
                      })}
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="space-y-1 p-5">
                <p className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Gauge className="h-4 w-4" /> {t('teacher.insights.estimate.title')}
                </p>
                {data.recentScoreEstimate.estimate === null ? (
                  <p className="pt-1 text-sm text-muted-foreground">
                    {t('teacher.insights.estimate.none')}
                  </p>
                ) : (
                  <>
                    <p className="text-2xl font-bold tabular-nums">
                      {data.recentScoreEstimate.estimate}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {t('teacher.insights.estimate.basedOn', {
                        count: data.recentScoreEstimate.basedOn,
                      })}
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      {t('teacher.insights.estimate.disclaimer')}
                    </p>
                  </>
                )}
              </CardContent>
            </Card>
          </div>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold">{t('teacher.insights.weakTopics.title')}</h2>
            {data.weakTopics.length === 0 ? (
              <Card>
                <CardContent className="p-6 text-sm text-muted-foreground">
                  {t('teacher.insights.weakTopics.empty')}
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardContent className="divide-y divide-border p-0">
                  {data.weakTopics.map((topic) => (
                    <div key={topic.categoryId} className="flex items-center gap-4 p-4">
                      <Badge
                        variant={topic.module === 'math' ? 'math' : 'rw'}
                        className="shrink-0"
                      >
                        {t(`modules.${topic.module}`)}
                      </Badge>
                      <span className="min-w-0 flex-1 truncate text-sm font-medium">
                        {topic.categoryName}
                      </span>
                      <span className="shrink-0 text-sm tabular-nums text-muted-foreground">
                        {pct(topic.accuracyPct)} · {topic.totalAnswered}
                      </span>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}
          </section>

          <section className="space-y-4">
            <h2 className="text-xl font-semibold">{t('analytics.mastery.heading')}</h2>

            {data.progress.length === 0 ? (
              <Card>
                <CardContent className="flex flex-col items-center gap-3 p-10 text-center">
                  <BarChart3 className="h-8 w-8 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">
                    {t('teacher.studentAnalytics.noData')}
                  </p>
                </CardContent>
              </Card>
            ) : (
              <>
                <Card>
                  <CardContent className="p-5">
                    <Chart data={data.progress} />
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="divide-y divide-border p-0">
                    {data.progress.map((r) => (
                      <div key={r.category} className="flex items-center gap-4 p-4">
                        <Badge variant={r.module === 'math' ? 'math' : 'rw'} className="shrink-0">
                          {t(`modules.${r.module}`)}
                        </Badge>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-2">
                            <span className="truncate text-sm font-medium">{r.categoryName}</span>
                            <span className="shrink-0 text-sm tabular-nums text-muted-foreground">
                              {r.totalCorrect}/{r.totalAnswered} · {pct(r.accuracyPct)}
                            </span>
                          </div>
                          <Progress
                            value={num(r.accuracyPct) ?? 0}
                            className="mt-2"
                            indicatorClassName={r.module === 'math' ? 'bg-math' : 'bg-rw'}
                          />
                        </div>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              </>
            )}
          </section>
        </>
      )}
    </div>
  )
}
