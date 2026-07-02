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
  return (
    homeworkStatusOf(homework) === 'assigned' &&
    new Date(homework.dueAt).getTime() < Date.now()
  )
}

const VARIANT: Record<HomeworkStatus, BadgeProps['variant']> = {
  assigned: 'warning',
  submitted: 'success',
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
