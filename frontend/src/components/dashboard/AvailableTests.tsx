// Domain: Student / Assessments
// Description: Startable exam templates. Starting POSTs /sessions/ then routes
//   into the fullscreen test engine.
'use client'

import { useRouter } from 'next/navigation'
import { useQuery, useMutation } from '@tanstack/react-query'
import { Clock, FileText, Layers, Play } from 'lucide-react'
import { examAPI } from '@/lib/api/exams'
import { sessionAPI } from '@/lib/api/sessions'
import { useSessionStore } from '@/lib/stores/sessionStore'
import { useToast } from '@/components/ui/toast'
import { useI18n, plural } from '@/lib/i18n/I18nProvider'
import { parseApiError } from '@/lib/api/errors'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import type { ExamListItem } from '@/types'

function ExamCard({ exam }: { exam: ExamListItem }) {
  const router = useRouter()
  const { toast } = useToast()
  const { t, locale } = useI18n()
  const resetSession = useSessionStore((s) => s.resetSession)

  const start = useMutation({
    mutationFn: () => sessionAPI.start(exam.id),
    onSuccess: (session) => {
      resetSession()
      router.push(`/session/${session.id}`)
    },
    onError: (err) => {
      toast({
        variant: 'error',
        title: t('dashboard.practice.startFailed'),
        description: parseApiError(err).message,
      })
    },
  })

  return (
    <Card className="flex flex-col">
      <CardContent className="flex flex-1 flex-col gap-4 p-5">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h3 className="font-semibold leading-snug">{exam.title}</h3>
            {exam.description && (
              <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{exam.description}</p>
            )}
          </div>
          <Badge
            variant={
              exam.module === 'math' ? 'math' : exam.module === 'reading_writing' ? 'rw' : 'secondary'
            }
          >
            {t(`modules.${exam.module}`)}
          </Badge>
        </div>

        <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <Layers className="h-4 w-4" /> {exam.sectionCount}{' '}
            {plural(
              locale,
              exam.sectionCount,
              t('dashboard.practice.sectionsOne'),
              t('dashboard.practice.sectionsOther')
            )}
          </span>
          <span className="flex items-center gap-1.5">
            <FileText className="h-4 w-4" /> {exam.questionCount}{' '}
            {plural(
              locale,
              exam.questionCount,
              t('dashboard.practice.questionsOne'),
              t('dashboard.practice.questionsOther')
            )}
          </span>
          {exam.timeLimit !== null && (
            <span className="flex items-center gap-1.5">
              <Clock className="h-4 w-4" /> {exam.timeLimit} {t('dashboard.practice.minutes')}
            </span>
          )}
        </div>

        <Button className="mt-auto w-full" loading={start.isPending} onClick={() => start.mutate()}>
          <Play className="h-4 w-4" /> {t('dashboard.practice.start')}
        </Button>
      </CardContent>
    </Card>
  )
}

export function AvailableTests() {
  const t = useI18n().t
  const { data, isLoading, isError } = useQuery({
    queryKey: ['exams'],
    queryFn: () => examAPI.list(),
  })

  return (
    <section id="tests" className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold">{t('dashboard.practice.title')}</h2>
        <p className="text-sm text-muted-foreground">{t('dashboard.practice.subtitle')}</p>
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
          {data.map((exam) => (
            <ExamCard key={exam.id} exam={exam} />
          ))}
        </div>
      )}
    </section>
  )
}
