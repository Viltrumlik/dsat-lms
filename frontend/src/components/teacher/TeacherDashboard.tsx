// Domain: Academy (teacher)
// Description: Teacher home — a lean overview, not a dumping ground. Clickable
//   count cards route to the dedicated (paginated) pages, and a short preview
//   surfaces the students who most need attention. The full, growing lists live
//   on /teacher/students, /teacher/grading and /teacher/homework.
'use client'

import * as React from 'react'
import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import { AlertTriangle, ArrowRight, ClipboardCheck, School, Users } from 'lucide-react'
import { teacherAPI } from '@/lib/api/teacher'
import { useI18n } from '@/lib/i18n/I18nProvider'
import { Card, CardContent } from '@/components/ui/card'
import type { AtRiskStudent } from '@/types'
import { RiskBadge, useReasonText } from './RiskBadge'

function StatCard({
  href,
  label,
  value,
  icon: Icon,
  highlight,
}: {
  href: string
  label: string
  value: number
  icon: React.ComponentType<{ className?: string }>
  highlight?: boolean
}) {
  return (
    <Link href={href} className="block focus:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded-xl">
      <Card className="transition-colors hover:border-primary">
        <CardContent className="flex items-center gap-4 p-5">
          <span
            className={
              highlight && value > 0
                ? 'flex h-11 w-11 items-center justify-center rounded-lg bg-error-light text-error-dark'
                : 'flex h-11 w-11 items-center justify-center rounded-lg bg-primary-50 text-primary-700 dark:bg-primary-800/40 dark:text-primary-100'
            }
          >
            <Icon className="h-5 w-5" />
          </span>
          <div>
            <p className="text-2xl font-bold leading-tight tabular-nums">{value}</p>
            <p className="text-sm text-muted-foreground">{label}</p>
          </div>
        </CardContent>
      </Card>
    </Link>
  )
}

function AtRiskRow({ item }: { item: AtRiskStudent }) {
  const { t } = useI18n()
  const reasonText = useReasonText()
  const why = item.risk.reasons.map(reasonText).join(', ')
  return (
    <div className="flex items-center gap-3 p-4">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <RiskBadge level={item.risk.level} />
          <Link
            href={`/teacher/students/${item.student.id}?class=${item.classId}`}
            className="truncate text-sm font-medium text-primary hover:underline"
          >
            {item.student.fullName || item.student.email}
          </Link>
        </div>
        {why && <p className="mt-1 truncate text-xs text-muted-foreground">{why}</p>}
      </div>
      <Link
        href={`/teacher/students/${item.student.id}?class=${item.classId}`}
        className="shrink-0 text-sm text-muted-foreground hover:text-foreground"
      >
        {t('teacher.dashboard.atRisk.view')}
      </Link>
    </div>
  )
}

export function TeacherDashboard() {
  const { t } = useI18n()
  const { data, isLoading, isError } = useQuery({
    queryKey: ['teacher', 'dashboard'],
    queryFn: teacherAPI.dashboard,
  })

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t('teacher.dashboard.title')}</h1>
        <p className="text-muted-foreground">{t('teacher.dashboard.subtitle')}</p>
      </div>

      {isLoading && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-24 animate-pulse rounded-xl bg-muted" />
          ))}
        </div>
      )}

      {isError && (
        <Card>
          <CardContent className="p-5 text-sm text-muted-foreground">
            {t('teacher.dashboard.loadFailed')}
          </CardContent>
        </Card>
      )}

      {data && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              href="/teacher/classes"
              label={t('teacher.dashboard.counts.classes')}
              value={data.counts.classes}
              icon={School}
            />
            <StatCard
              href="/teacher/students"
              label={t('teacher.dashboard.counts.activeStudents')}
              value={data.counts.activeStudents}
              icon={Users}
            />
            <StatCard
              href="/teacher/grading"
              label={t('teacher.dashboard.counts.pendingGrading')}
              value={data.counts.pendingGrading}
              icon={ClipboardCheck}
            />
            <StatCard
              href="/teacher/students?risk=attention"
              label={t('teacher.dashboard.counts.atRisk')}
              value={data.counts.atRiskStudents}
              icon={AlertTriangle}
              highlight
            />
          </div>

          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">{t('teacher.dashboard.atRisk.title')}</h2>
              {data.counts.atRiskStudents > data.atRiskStudents.length && (
                <Link
                  href="/teacher/students?risk=attention"
                  className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
                >
                  {t('teacher.dashboard.seeAll')} <ArrowRight className="h-4 w-4" />
                </Link>
              )}
            </div>
            <Card>
              <CardContent
                className={
                  data.atRiskStudents.length === 0
                    ? 'p-6 text-sm text-muted-foreground'
                    : 'divide-y divide-border p-0'
                }
              >
                {data.atRiskStudents.length === 0
                  ? t('teacher.dashboard.atRisk.empty')
                  : data.atRiskStudents.map((item) => (
                      <AtRiskRow key={item.student.id} item={item} />
                    ))}
              </CardContent>
            </Card>
          </section>
        </>
      )}
    </div>
  )
}
