// Domain: Student / Assessments
// Description: One startable paper. Starting POSTs /sessions/ and routes into
//   the fullscreen engine.
//
// The server can refuse a start for reasons a student needs to read, not just a
// generic failure: the paper is not open yet, it has closed, their attempts are
// used up, or a free account has hit its weekly practice cap. Those come back
// with their own error codes and a written message, so the message is what we
// show. (See apps/assessments/eligibility.py.)
'use client'

import { useRouter } from 'next/navigation'
import { useMutation } from '@tanstack/react-query'
import { Clock, FileText, Layers, Play } from 'lucide-react'
import { sessionAPI } from '@/lib/api/sessions'
import { useSessionStore } from '@/lib/stores/sessionStore'
import { useToast } from '@/components/ui/toast'
import { useI18n, plural } from '@/lib/i18n/I18nProvider'
import { parseApiError } from '@/lib/api/errors'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import type { ExamListItem } from '@/types'

/** Start refusals that carry a message worth showing verbatim. */
const ELIGIBILITY_CODES = new Set([
  'EXAM_NOT_OPEN_YET',
  'EXAM_CLOSED',
  'EXAM_ATTEMPTS_EXHAUSTED',
  'PRACTICE_LIMIT_REACHED',
  'PAST_PAPER_LIMIT_REACHED',
])

export function ExamCard({ exam }: { exam: ExamListItem }) {
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
      const { code, message } = parseApiError(err)
      toast({
        variant: 'error',
        title: ELIGIBILITY_CODES.has(code)
          ? t('tests.unavailable')
          : t('dashboard.practice.startFailed'),
        description: message,
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
