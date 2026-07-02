// Domain: Homework
// Description: The student's homework list — a row per assignment with class,
//   relative due time, and status. A 403 (public user) renders as a friendly
//   academy-only locked state, not an error.
'use client'

import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import { AxiosError } from 'axios'
import { formatDistanceToNow } from 'date-fns'
import { uz as uzDate } from 'date-fns/locale'
import { ChevronRight, ClipboardList, FileText, Lock } from 'lucide-react'
import { homeworkAPI } from '@/lib/api/homework'
import { useI18n } from '@/lib/i18n/I18nProvider'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { HomeworkStatusBadge } from './HomeworkStatusBadge'
import type { Locale } from '@/lib/i18n/config'
import type { Homework } from '@/types'

function httpStatusOf(err: unknown): number | undefined {
  return err instanceof AxiosError ? err.response?.status : undefined
}

function relativeDue(iso: string, locale: Locale) {
  try {
    return formatDistanceToNow(new Date(iso), {
      addSuffix: true,
      locale: locale === 'uz' ? uzDate : undefined,
    })
  } catch {
    return ''
  }
}

function HomeworkRow({ homework }: { homework: Homework }) {
  const { t, locale } = useI18n()
  return (
    <Link
      href={`/homework/${homework.id}`}
      className="flex items-center justify-between gap-4 px-5 py-4 transition-colors hover:bg-muted/60"
    >
      <div className="min-w-0">
        <p className="truncate font-medium">{homework.title}</p>
        <p className="text-xs text-muted-foreground">
          {homework.className} · {t('homework.due', { time: relativeDue(homework.dueAt, locale) })}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-3">
        {homework.exam && (
          <Badge variant="outline" className="hidden sm:inline-flex">
            <FileText className="mr-1 h-3 w-3" /> {t('homework.testBadge')}
          </Badge>
        )}
        <HomeworkStatusBadge homework={homework} />
        <ChevronRight className="hidden h-4 w-4 text-muted-foreground sm:block" />
      </div>
    </Link>
  )
}

export function HomeworkList() {
  const t = useI18n().t
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['homework'],
    queryFn: homeworkAPI.list,
    // Don't hammer the server on permission/other 4xx — they won't change.
    retry: (failureCount, err) => {
      const status = httpStatusOf(err)
      if (status && status >= 400 && status < 500) return false
      return failureCount < 2
    },
  })

  const academyOnly = isError && httpStatusOf(error) === 403

  if (isLoading) {
    return (
      <Card>
        <CardContent className="space-y-3 p-5">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-10 animate-pulse rounded bg-muted" />
          ))}
        </CardContent>
      </Card>
    )
  }

  if (academyOnly) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-3 p-10 text-center">
          <Lock className="h-8 w-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">{t('homework.academyOnly')}</p>
        </CardContent>
      </Card>
    )
  }

  if (isError) {
    return (
      <Card>
        <CardContent className="p-5 text-sm text-muted-foreground">
          {t('homework.loadFailed')}
        </CardContent>
      </Card>
    )
  }

  if (!data || data.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-3 p-10 text-center">
          <ClipboardList className="h-8 w-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">{t('homework.empty')}</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <div className="divide-y divide-border">
        {data.map((homework) => (
          <HomeworkRow key={homework.id} homework={homework} />
        ))}
      </div>
    </Card>
  )
}
