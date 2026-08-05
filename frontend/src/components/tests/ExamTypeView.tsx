// Domain: Student / Assessments
// Description: The list of papers of ONE type — the body of /tests/<slug>.
//   Each exam type gets its own page rather than sharing a single filtered list,
//   so a student can find a mock or a midterm without knowing it exists.
'use client'

import { useQuery } from '@tanstack/react-query'
import { examAPI } from '@/lib/api/exams'
import { useT } from '@/lib/i18n/I18nProvider'
import { Card, CardContent } from '@/components/ui/card'
import { ExamCard } from './ExamCard'
import type { ExamTypeMeta } from './examTypes'

export function ExamTypeView({ meta }: { meta: ExamTypeMeta }) {
  const t = useT()
  const { data, isLoading, isError } = useQuery({
    queryKey: ['exams', meta.type],
    queryFn: () => examAPI.list(meta.type),
  })

  const Icon = meta.icon

  return (
    <div className="space-y-6">
      <div className="flex items-start gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-primary-50 text-primary-700 dark:bg-primary-800/40 dark:text-primary-100">
          <Icon className="h-6 w-6" />
        </span>
        <div>
          <h1 className="text-2xl font-bold">{t(`tests.types.${meta.key}.title`)}</h1>
          <p className="text-sm text-muted-foreground">{t(`tests.types.${meta.key}.subtitle`)}</p>
        </div>
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
          <CardContent className="p-10 text-center text-sm text-muted-foreground">
            {t(`tests.types.${meta.key}.empty`)}
          </CardContent>
        </Card>
      )}

      {data && data.length > 0 && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {data.map((exam) => (
            <ExamCard key={exam.id} exam={exam} />
          ))}
        </div>
      )}
    </div>
  )
}
