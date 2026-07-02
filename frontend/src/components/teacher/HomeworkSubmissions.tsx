// Domain: Homework (teacher)
// Description: Per-student submissions for one homework — header from the
//   (cached) homework list, table of student / status / submitted-at.
'use client'

import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import { format } from 'date-fns'
import { uz as uzDate } from 'date-fns/locale'
import { ArrowLeft, Inbox } from 'lucide-react'
import { homeworkAPI } from '@/lib/api/homework'
import { teacherAPI } from '@/lib/api/teacher'
import { useI18n } from '@/lib/i18n/I18nProvider'
import { Badge, type BadgeProps } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import type { HomeworkStatus } from '@/types'

const STATUS_VARIANT: Record<HomeworkStatus, BadgeProps['variant']> = {
  assigned: 'warning',
  submitted: 'success',
  graded: 'default',
}

export function HomeworkSubmissions({ homeworkId }: { homeworkId: string }) {
  const { t, locale } = useI18n()
  const dateLocale = locale === 'uz' ? uzDate : undefined

  const homeworkQuery = useQuery({
    queryKey: ['homework'],
    queryFn: homeworkAPI.list,
  })
  const homework = homeworkQuery.data?.find((h) => h.id === homeworkId)

  const submissionsQuery = useQuery({
    queryKey: ['teacher', 'submissions', homeworkId],
    queryFn: () => teacherAPI.submissions(homeworkId),
  })

  return (
    <div className="space-y-6">
      <Link
        href="/teacher/homework"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> {t('teacher.submissions.back')}
      </Link>

      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          {homework?.title ?? t('teacher.submissions.fallbackTitle')}
        </h1>
        {homework && (
          <p className="text-muted-foreground">
            {homework.className} ·{' '}
            {t('homework.dueAt', {
              date: format(new Date(homework.dueAt), 'PPp', { locale: dateLocale }),
            })}
          </p>
        )}
      </div>

      {submissionsQuery.isLoading && (
        <Card>
          <CardContent className="space-y-3 p-5">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-10 animate-pulse rounded bg-muted" />
            ))}
          </CardContent>
        </Card>
      )}

      {submissionsQuery.isError && (
        <Card>
          <CardContent className="p-5 text-sm text-muted-foreground">
            {t('teacher.submissions.loadFailed')}
          </CardContent>
        </Card>
      )}

      {submissionsQuery.data && submissionsQuery.data.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 p-10 text-center">
            <Inbox className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">{t('teacher.submissions.empty')}</p>
          </CardContent>
        </Card>
      )}

      {submissionsQuery.data && submissionsQuery.data.length > 0 && (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('teacher.submissions.student')}</TableHead>
                <TableHead>{t('teacher.submissions.status')}</TableHead>
                <TableHead>{t('teacher.submissions.submittedAt')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {submissionsQuery.data.map((submission) => (
                <TableRow key={submission.id}>
                  <TableCell>
                    <span className="font-medium">
                      {submission.student.fullName || submission.student.email}
                    </span>
                    <span className="block text-xs text-muted-foreground">
                      {submission.student.email}
                    </span>
                  </TableCell>
                  <TableCell>
                    <Badge variant={STATUS_VARIANT[submission.status]}>
                      {t(`homework.status.${submission.status}`)}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {submission.submittedAt
                      ? format(new Date(submission.submittedAt), 'PPp', { locale: dateLocale })
                      : '—'}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  )
}
