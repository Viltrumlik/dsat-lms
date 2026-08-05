// Domain: Student / Assessments
// Description: The dashboard's practice shortcut — the first few practice papers,
//   with a link through to the full list. Every OTHER exam type (past paper,
//   mock, midterm, assessment) has its own page under /tests/<slug>; this is
//   only the quick start, not the catalogue.
'use client'

import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import { ArrowRight } from 'lucide-react'
import { examAPI } from '@/lib/api/exams'
import { useI18n } from '@/lib/i18n/I18nProvider'
import { Card, CardContent } from '@/components/ui/card'
import { ExamCard } from '@/components/tests/ExamCard'

export function AvailableTests() {
  const t = useI18n().t
  const { data, isLoading, isError } = useQuery({
    queryKey: ['exams', 'practice'],
    queryFn: () => examAPI.list('practice'),
  })

  return (
    <section id="tests" className="space-y-4">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold">{t('dashboard.practice.title')}</h2>
          <p className="text-sm text-muted-foreground">{t('dashboard.practice.subtitle')}</p>
        </div>
        <Link
          href="/tests/practice"
          className="flex shrink-0 items-center gap-1 text-sm font-medium text-primary hover:underline"
        >
          {t('dashboard.practice.seeAll')} <ArrowRight className="h-4 w-4" />
        </Link>
      </div>

      {isLoading && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Card key={i}>
              <CardContent className="space-y-4 p-5">
                <div className="h-5 w-2/3 animate-pulse rounded bg-muted" />
                <div className="h-4 w-full animate-pulse rounded bg-muted" />
                <div className="h-9 w-full animate-pulse rounded bg-muted" />
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {isError && (
        <Card>
          <CardContent className="p-5 text-sm text-muted-foreground">
            {t('dashboard.practice.loadFailed')}
          </CardContent>
        </Card>
      )}

      {data && data.length === 0 && (
        <Card>
          <CardContent className="p-8 text-center text-sm text-muted-foreground">
            {t('dashboard.practice.empty')}{' '}
            <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
              python manage.py seed_demo_exam
            </code>
          </CardContent>
        </Card>
      )}

      {data && data.length > 0 && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {data.slice(0, 3).map((exam) => (
            <ExamCard key={exam.id} exam={exam} />
          ))}
        </div>
      )}
    </section>
  )
}
