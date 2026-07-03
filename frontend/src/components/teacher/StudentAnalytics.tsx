// Domain: Academy (teacher)
// Description: Read-only per-student analytics drilldown — summary stats + per-topic
//   accuracy (lazy chart + list). Reuses the analytics chart; data is scoped
//   server-side to the teacher's own students.
'use client'

import * as React from 'react'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import { Activity, ArrowLeft, BarChart3, CheckCircle2, Target, Trophy } from 'lucide-react'
import { teacherAPI } from '@/lib/api/teacher'
import { useT } from '@/lib/i18n/I18nProvider'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { num, pct } from '@/lib/utils/num'

const Chart = dynamic(() => import('@/components/analytics/AccuracyByCategoryChart'), {
  ssr: false,
  loading: () => <div className="h-48 animate-pulse rounded-lg bg-muted" />,
})

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
