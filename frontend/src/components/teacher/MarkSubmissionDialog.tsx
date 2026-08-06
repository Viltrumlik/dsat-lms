// Domain: Homework (teacher)
// Description: Marking one student's work — read what they handed in, open
//   their files, then either record a grade or hand it back for another go.
//
// Returning is deliberately as prominent as grading: without it a teacher who
// wants a correction has no move except to mark the work badly and move on.
'use client'

import * as React from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { format } from 'date-fns'
import { uz as uzDate } from 'date-fns/locale'
import { RotateCcw } from 'lucide-react'
import { homeworkAPI } from '@/lib/api/homework'
import { useI18n } from '@/lib/i18n/I18nProvider'
import { parseApiError } from '@/lib/api/errors'
import { useToast } from '@/components/ui/toast'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { FileList } from '@/components/homework/FileList'
import type { HomeworkSubmission } from '@/types'

interface Props {
  homeworkId: string
  submission: HomeworkSubmission | null
  onOpenChange: (open: boolean) => void
}

export function MarkSubmissionDialog({ homeworkId, submission, onOpenChange }: Props) {
  const { t, locale } = useI18n()
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const dateLocale = locale === 'uz' ? uzDate : undefined

  const [grade, setGrade] = React.useState('')
  const [feedback, setFeedback] = React.useState('')

  // Seed once per submission — a refetch must not wipe what the teacher typed.
  const seededFor = React.useRef<string | null>(null)
  React.useEffect(() => {
    if (!submission || seededFor.current === submission.id) return
    seededFor.current = submission.id
    setGrade(submission.grade ?? '')
    setFeedback(submission.feedback ?? '')
  }, [submission])

  const done = (key: string) => {
    queryClient.invalidateQueries({ queryKey: ['teacher', 'submissions', homeworkId] })
    queryClient.invalidateQueries({ queryKey: ['teacher', 'grading'] })
    onOpenChange(false)
    toast({ variant: 'success', title: t(key) })
  }

  const fail = (err: unknown) =>
    toast({ variant: 'error', title: t('teacher.mark.failed'), description: parseApiError(err).message })

  const save = useMutation({
    mutationFn: () =>
      homeworkAPI.grade(homeworkId, submission!.id, {
        grade: grade.trim() === '' ? null : grade.trim(),
        feedback,
      }),
    onSuccess: () => done('teacher.mark.graded'),
    onError: fail,
  })

  const handBack = useMutation({
    mutationFn: () => homeworkAPI.returnForRevision(homeworkId, submission!.id, feedback),
    onSuccess: () => done('teacher.mark.returned'),
    onError: fail,
  })

  const busy = save.isPending || handBack.isPending
  const nothingHandedIn = submission?.status === 'assigned'

  return (
    <Dialog open={submission !== null} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
        {submission && (
          <>
            <DialogHeader>
              <DialogTitle className="flex flex-wrap items-center gap-2">
                {submission.student.fullName || submission.student.email}
                {submission.isLate && <Badge variant="error">{t('homework.late')}</Badge>}
                {submission.attemptNumber > 1 && (
                  <Badge variant="secondary">
                    {t('homework.attemptN', { n: submission.attemptNumber })}
                  </Badge>
                )}
              </DialogTitle>
            </DialogHeader>

            <div className="space-y-4">
              {nothingHandedIn ? (
                <p className="text-sm text-muted-foreground">{t('teacher.mark.nothingYet')}</p>
              ) : (
                <div className="space-y-3 rounded-lg border border-border p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {t('homework.yourWork')}
                    {submission.submittedAt && (
                      <span className="ml-2 font-normal normal-case tracking-normal">
                        {format(new Date(submission.submittedAt), 'PPp', { locale: dateLocale })}
                      </span>
                    )}
                  </p>
                  {submission.responseText ? (
                    <p className="whitespace-pre-wrap text-sm leading-relaxed">
                      {submission.responseText}
                    </p>
                  ) : (
                    submission.files.length === 0 && (
                      <p className="text-sm text-muted-foreground">
                        {t('homework.noWorkAttached')}
                      </p>
                    )
                  )}
                  <FileList files={submission.files} />
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="mark-grade">
                  {t('teacher.mark.gradeLabel', { scale: submission.gradeScale })}
                </Label>
                <Input
                  id="mark-grade"
                  inputMode="decimal"
                  value={grade}
                  onChange={(e) => setGrade(e.target.value)}
                  className="max-w-[8rem]"
                  disabled={nothingHandedIn}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="mark-feedback">{t('teacher.mark.feedbackLabel')}</Label>
                <Textarea
                  id="mark-feedback"
                  rows={4}
                  value={feedback}
                  onChange={(e) => setFeedback(e.target.value)}
                  placeholder={t('teacher.mark.feedbackPlaceholder')}
                />
              </div>
            </div>

            <DialogFooter className="flex-col-reverse gap-2 sm:flex-row">
              <Button
                variant="outline"
                loading={handBack.isPending}
                disabled={busy || nothingHandedIn}
                onClick={() => handBack.mutate()}
              >
                <RotateCcw className="h-4 w-4" /> {t('teacher.mark.return')}
              </Button>
              <Button
                loading={save.isPending}
                disabled={busy || nothingHandedIn}
                onClick={() => save.mutate()}
              >
                {t('teacher.mark.save')}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
