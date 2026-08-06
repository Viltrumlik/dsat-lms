// Domain: Homework
// Description: Status badge for a homework row/detail. Derives the student's
//   effective status from mySubmission (absent → assigned), with a distinct
//   "overdue" look when past due and still unsubmitted.
'use client'

import { Badge, type BadgeProps } from '@/components/ui/badge'
import { useT } from '@/lib/i18n/I18nProvider'
import type { Homework, HomeworkStatus } from '@/types'

export function homeworkStatusOf(homework: Homework): HomeworkStatus {
  return homework.mySubmission?.status ?? 'assigned'
}

export function isOverdue(homework: Homework): boolean {
  // A returned piece is outstanding work too — if it is past due it reads as
  // overdue, same as one never handed in.
  const status = homeworkStatusOf(homework)
  return (
    (status === 'assigned' || status === 'returned') &&
    new Date(homework.dueAt).getTime() < Date.now()
  )
}

const VARIANT: Record<HomeworkStatus, BadgeProps['variant']> = {
  assigned: 'warning',
  submitted: 'success',
  // Handed back: action is on the student again, so it reads like a warning
  // rather than a completion.
  returned: 'warning',
  graded: 'default',
}

export function HomeworkStatusBadge({ homework }: { homework: Homework }) {
  const t = useT()
  if (isOverdue(homework)) {
    return <Badge variant="error">{t('homework.status.overdue')}</Badge>
  }
  const status = homeworkStatusOf(homework)
  return <Badge variant={VARIANT[status]}>{t(`homework.status.${status}`)}</Badge>
}
