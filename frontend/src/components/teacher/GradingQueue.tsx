// Domain: Academy (teacher)
// Description: The homework-submission queue — cursor-paginated, newest first, with
//   a pending/all toggle. "Pending" is the grading to-do; "all" is a recent feed.
'use client'

import * as React from 'react'
import Link from 'next/link'
import { useInfiniteQuery } from '@tanstack/react-query'
import { formatDistanceToNow } from 'date-fns'
import { uz as uzDate } from 'date-fns/locale'
import { ClipboardCheck, Inbox } from 'lucide-react'
import { teacherAPI, type GradingListParams } from '@/lib/api/teacher'
import { cursorFromUrl } from '@/lib/api/client'
import { useI18n } from '@/lib/i18n/I18nProvider'
import { Badge, type BadgeProps } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { HomeworkStatus } from '@/types'

const STATUS_VARIANT: Record<HomeworkStatus, BadgeProps['variant']> = {
  assigned: 'warning',
  submitted: 'success',
  returned: 'warning',
  graded: 'default',
}

export function GradingQueue() {
  const { t, locale } = useI18n()
  const [status, setStatus] = React.useState<'pending' | 'all'>('pending')
  const dateLocale = locale === 'uz' ? uzDate : undefined
  const rel = (iso: string | null) =>
    iso ? formatDistanceToNow(new Date(iso), { addSuffix: true, locale: dateLocale }) : '—'

  const params: GradingListParams = { status }
  const query = useInfiniteQuery({
    queryKey: ['teacher', 'grading', params],
    queryFn: ({ pageParam }) => teacherAPI.grading({ ...params, cursor: pageParam }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => cursorFromUrl(last.pagination?.next ?? null) ?? undefined,
  })
  const rows = query.data?.pages.flatMap((p) => p.data) ?? []

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t('teacher.grading.title')}</h1>
          <p className="text-muted-foreground">{t('teacher.grading.subtitle')}</p>
        </div>
        <Select value={status} onValueChange={(v) => setStatus(v as 'pending' | 'all')}>
          <SelectTrigger className="sm:w-48" aria-label={t('teacher.grading.filter')}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="pending">{t('teacher.grading.filterPending')}</SelectItem>
            <SelectItem value="all">{t('teacher.grading.filterAll')}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {query.isLoading && (
        <Card>
          <CardContent className="space-y-3 p-5">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-10 animate-pulse rounded bg-muted" />
            ))}
          </CardContent>
        </Card>
      )}

      {query.isError && (
        <Card>
          <CardContent className="flex flex-wrap items-center justify-between gap-3 p-5 text-sm text-muted-foreground">
            {t('teacher.grading.loadFailed')}
            <Button variant="outline" size="sm" onClick={() => query.refetch()}>
              {t('common.tryAgain')}
            </Button>
          </CardContent>
        </Card>
      )}

      {query.data && rows.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 p-10 text-center">
            <Inbox className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">{t('teacher.grading.empty')}</p>
          </CardContent>
        </Card>
      )}

      {rows.length > 0 && (
        <Card>
          <CardContent className="divide-y divide-border p-0">
            {rows.map((s) => (
              <div key={s.submissionId} className="flex items-center gap-3 p-4">
                <ClipboardCheck className="h-4 w-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <Link
                    href={`/teacher/homework/${s.homeworkId}`}
                    className="truncate text-sm font-medium text-primary hover:underline"
                  >
                    {s.homeworkTitle}
                  </Link>
                  <p className="truncate text-xs text-muted-foreground">
                    {s.student.fullName || s.student.email} · {rel(s.submittedAt)}
                  </p>
                </div>
                <Badge variant={STATUS_VARIANT[s.status]} className="shrink-0">
                  {t(`homework.status.${s.status}`)}
                </Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {query.hasNextPage && (
        <div className="flex justify-center">
          <Button
            variant="outline"
            loading={query.isFetchingNextPage}
            onClick={() => query.fetchNextPage()}
          >
            {t('teacher.common.loadMore')}
          </Button>
        </div>
      )}
    </div>
  )
}
