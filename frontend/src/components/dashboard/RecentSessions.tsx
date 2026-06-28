// Domain: Student / Assessments
// Description: The student's recent exam sessions with a resume / view-results link.
'use client'

import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import { formatDistanceToNow } from 'date-fns'
import { ChevronRight } from 'lucide-react'
import { sessionAPI } from '@/lib/api/sessions'
import { Badge, type BadgeProps } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import type { SessionListItem, SessionStatus } from '@/types'

const STATUS: Record<SessionStatus, { label: string; variant: BadgeProps['variant'] }> = {
  in_progress: { label: 'In progress', variant: 'warning' },
  paused: { label: 'Paused', variant: 'warning' },
  completed: { label: 'Completed', variant: 'success' },
  abandoned: { label: 'Abandoned', variant: 'secondary' },
}

function relativeTime(iso: string) {
  try {
    return formatDistanceToNow(new Date(iso), { addSuffix: true })
  } catch {
    return ''
  }
}

function SessionRow({ session }: { session: SessionListItem }) {
  const status = STATUS[session.status]
  const isResumable = session.status === 'in_progress' || session.status === 'paused'
  const href = session.status === 'completed' ? `/results/${session.id}` : `/session/${session.id}`
  const cta = isResumable ? 'Resume' : session.status === 'completed' ? 'View results' : 'View'

  return (
    <Link
      href={href}
      className="flex items-center justify-between gap-4 px-5 py-4 transition-colors hover:bg-muted/60"
    >
      <div className="min-w-0">
        <p className="truncate font-medium">{session.exam.title}</p>
        <p className="text-xs text-muted-foreground">Started {relativeTime(session.startedAt)}</p>
      </div>
      <div className="flex shrink-0 items-center gap-3">
        <Badge variant={status.variant}>{status.label}</Badge>
        <span className="hidden items-center gap-0.5 text-sm font-medium text-primary sm:flex">
          {cta} <ChevronRight className="h-4 w-4" />
        </span>
      </div>
    </Link>
  )
}

export function RecentSessions() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['sessions'],
    queryFn: sessionAPI.list,
  })

  const sessions = data?.data ?? []

  return (
    <section className="space-y-4">
      <h2 className="text-xl font-semibold">Recent activity</h2>
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
            Couldn&apos;t load your sessions.
          </CardContent>
        )}
        {!isLoading && !isError && sessions.length === 0 && (
          <CardContent className="p-8 text-center text-sm text-muted-foreground">
            No sessions yet — start a practice test above.
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
