// Domain: Homework
// Description: The student's own submission after it has gone in — what they
//   handed over, the mark, the teacher's words, and the trail of what happened.
//   A RETURNED piece leads with the teacher's note, because that is the whole
//   reason the student is looking at this screen again.
'use client'

import { format, formatDistanceToNow } from 'date-fns'
import { uz as uzDate } from 'date-fns/locale'
import { CheckCircle2, Clock, GraduationCap, RotateCcw } from 'lucide-react'
import { useI18n } from '@/lib/i18n/I18nProvider'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { FileList } from './FileList'
import type { Locale } from '@/lib/i18n/config'
import type { HomeworkEventKind, HomeworkMySubmission } from '@/types'

function dateLocale(locale: Locale) {
  return locale === 'uz' ? uzDate : undefined
}

const EVENT_ICON: Record<HomeworkEventKind, React.ComponentType<{ className?: string }>> = {
  submitted: CheckCircle2,
  returned: RotateCcw,
  graded: GraduationCap,
}

export function SubmissionPanel({ submission }: { submission: HomeworkMySubmission }) {
  const { t, locale } = useI18n()
  const isReturned = submission.status === 'returned'
  const isGraded = submission.status === 'graded'

  return (
    <div className="space-y-4">
      {/* A hand-back is the headline — it is why they are back here. */}
      {isReturned && (
        <Card className="border-warning">
          <CardContent className="flex gap-3 p-5">
            <RotateCcw className="h-5 w-5 shrink-0 text-warning" />
            <div className="space-y-1">
              <p className="font-semibold">{t('homework.returned.title')}</p>
              {submission.feedback ? (
                <p className="whitespace-pre-wrap text-sm">{submission.feedback}</p>
              ) : (
                <p className="text-sm text-muted-foreground">{t('homework.returned.noNote')}</p>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {isGraded && (
        <Card>
          <CardContent className="space-y-3 p-5">
            <div className="flex items-center gap-3">
              <GraduationCap className="h-5 w-5 shrink-0 text-primary" />
              <p className="font-semibold">
                {submission.grade !== null
                  ? t('homework.gradedScore', {
                      grade: submission.grade,
                      scale: submission.gradeScale,
                    })
                  : t('homework.gradedNote')}
              </p>
            </div>
            {submission.feedback && (
              <p className="whitespace-pre-wrap text-sm text-muted-foreground">
                {submission.feedback}
              </p>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="space-y-4 p-5">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="font-semibold">{t('homework.yourWork')}</span>
            {submission.isLate && <Badge variant="error">{t('homework.late')}</Badge>}
            {submission.attemptNumber > 1 && (
              <Badge variant="secondary">
                {t('homework.attemptN', { n: submission.attemptNumber })}
              </Badge>
            )}
            {submission.submittedAt && (
              <span className="flex items-center gap-1.5 text-muted-foreground">
                <Clock className="h-4 w-4" />
                {formatDistanceToNow(new Date(submission.submittedAt), {
                  addSuffix: true,
                  locale: dateLocale(locale),
                })}
              </span>
            )}
          </div>

          {submission.responseText ? (
            <p className="whitespace-pre-wrap text-sm leading-relaxed">
              {submission.responseText}
            </p>
          ) : (
            submission.files.length === 0 && (
              <p className="text-sm text-muted-foreground">{t('homework.noWorkAttached')}</p>
            )
          )}

          <FileList files={submission.files} label={t('homework.form.filesLabel')} />
        </CardContent>
      </Card>

      {submission.events.length > 1 && (
        <div className="space-y-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            {t('homework.history')}
          </h2>
          <Card>
            <CardContent className="space-y-3 p-5">
              {submission.events.map((event) => {
                const Icon = EVENT_ICON[event.kind]
                return (
                  <div key={event.id} className="flex gap-3 text-sm">
                    <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                    <div className="min-w-0 flex-1">
                      <p>
                        <span className="font-medium">
                          {t(`homework.event.${event.kind}`)}
                        </span>
                        {event.actorName && (
                          <span className="text-muted-foreground"> · {event.actorName}</span>
                        )}
                        <span className="text-muted-foreground">
                          {' '}
                          · {format(new Date(event.createdAt), 'PPp', {
                            locale: dateLocale(locale),
                          })}
                        </span>
                      </p>
                      {event.note && (
                        <p className="whitespace-pre-wrap text-muted-foreground">{event.note}</p>
                      )}
                    </div>
                  </div>
                )
              })}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}
