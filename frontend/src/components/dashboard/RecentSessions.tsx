// Domain: Student / Assessments
// Description: The student's recent exam sessions with a resume / view-results link.
'use client'

import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import { formatDistanceToNow } from 'date-fns'
import { uz as uzDate } from 'date-fns/locale'
import { ChevronRight } from 'lucide-react'
import { sessionAPI } from '@/lib/api/sessions'
import { useI18n } from '@/lib/i18n/I18nProvider'
import { Badge, type BadgeProps } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import type { Locale } from '@/lib/i18n/config'
import type { SessionListItem, SessionStatus } from '@/types'

const STATUS_VARIANT: Record<SessionStatus, BadgeProps['variant']> = {
  in_progress: 'warning',
  paused: 'warning',
  completed: 'success',
  abandoned: 'secondary',
}

const STATUS_KEY: Record<SessionStatus, string> = {
  in_progress: 'dashboard.recent.inProgress',
  paused: 'dashboard.recent.paused',
  completed: 'dashboard.recent.completed',
  abandoned: 'dashboard.recent.abandoned',
}

function relativeTime(iso: string, locale: Locale) {
  try {
    return formatDistanceToNow(new Date(iso), {
      addSuffix: true,
      locale: locale === 'uz' ? uzDate : undefined,
    })
  } catch {
    return ''
  }
}

function SessionRow({ session }: { session: SessionListItem }) {
  const { t, locale } = useI18n()
  const isResumable = session.status === 'in_progress' || session.status === 'paused'
  const href = session.status === 'completed' ? `/results/${session.id}` : `/session/${session.id}`
  const cta = isResumable
    ? t('dashboard.recent.resume')
    : session.status === 'completed'
      ? t('dashboard.recent.viewResults')
      : t('dashboard.recent.view')

  return (
    <Link
      href={href}
      className="flex items-center justify-between gap-4 px-5 py-4 transition-colors hover:bg-muted/60"
    >
      <div className="min-w-0">
        <p className="truncate font-medium">{session.exam.title}</p>
        <p className="text-xs text-muted-foreground">
          {t('dashboard.recent.started', { time: relativeTime(session.startedAt, locale) })}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-3">
        <Badge variant={STATUS_VARIANT[session.status]}>{t(STATUS_KEY[session.status])}</Badge>
        <span className="hidden items-center gap-0.5 text-sm font-medium text-primary sm:flex">
          {cta} <ChevronRight className="h-4 w-4" />
        </span>
      </div>
    </Link>
  )
}

export function RecentSessions() {
  const t = useI18n().t
  const { data, isLoading, isError } = useQuery({
    queryKey: ['sessions'],
    queryFn: sessionAPI.list,
  })

  const sessions = data?.data ?? []

  return (
    <section className="space-y-4">
      <h2 className="text-xl font-semibold">{t('dashboard.recent.title')}</h2>
      <Card>
        {isLoading && (
          <CardContent className="space-y-3 p-5">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-10 animate-pulse rounded bg-muted" />
            ))}
          </CardContent>
        )}
        {isError && (
          <CardContent className="p-5 text-sm text-muted-foreground">
            {t('dashboard.recent.loadFailed')}
          </CardContent>
        )}
        {!isLoading && !isError && sessions.length === 0 && (
          <CardContent className="p-8 text-center text-sm text-muted-foreground">
            {t('dashboard.recent.empty')}
          </CardContent>
        )}
        {sessions.length > 0 && (
          <div className="divide-y divide-border">
            {sessions.slice(0, 6).map((session) => (
              <SessionRow key={session.id} session={session} />
            ))}
          </div>
        )}
      </Card>
    </section>
  )
}
