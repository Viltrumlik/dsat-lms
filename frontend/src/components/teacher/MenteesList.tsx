// Domain: Academy (mentor)
// Description: The mentor's mentee list — each mentee with lifecycle status and
//   last check-in, linking to the per-mentee drilldown. Data is scoped
//   server-side (mentor = me; full-access staff see their own assignments too).
'use client'

import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import { formatDistanceToNow } from 'date-fns'
import { uz as uzDate } from 'date-fns/locale'
import { ChevronRight, HeartHandshake } from 'lucide-react'
import { mentorAPI } from '@/lib/api/mentor'
import { useI18n } from '@/lib/i18n/I18nProvider'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import type { LifecycleStatus } from '@/types'

const STATUS_VARIANT: Record<LifecycleStatus, 'success' | 'warning' | 'secondary' | 'error'> = {
  active: 'success',
  frozen: 'warning',
  graduated: 'secondary',
  dropped: 'error',
}

export function MenteesList() {
  const { t, locale } = useI18n()
  const { data, isLoading, isError } = useQuery({
    queryKey: ['mentor', 'mentees'],
    queryFn: mentorAPI.myMentees,
  })

  const ago = (iso: string) =>
    formatDistanceToNow(new Date(iso), {
      addSuffix: true,
      locale: locale === 'uz' ? uzDate : undefined,
    })

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t('mentor.list.title')}</h1>
        <p className="text-muted-foreground">{t('mentor.list.subtitle')}</p>
      </div>

      {isLoading && (
        <Card>
          <CardContent className="space-y-3 p-5">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-12 animate-pulse rounded bg-muted" />
            ))}
          </CardContent>
        </Card>
      )}

      {isError && (
        <Card>
          <CardContent className="p-5 text-sm text-muted-foreground">
            {t('mentor.list.loadFailed')}
          </CardContent>
        </Card>
      )}

      {data && data.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 p-10 text-center">
            <HeartHandshake className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">{t('mentor.list.empty')}</p>
          </CardContent>
        </Card>
      )}

      {data && data.length > 0 && (
        <Card>
          <CardContent className="divide-y divide-border p-0">
            {data.map((mentee) => (
              <Link
                key={mentee.id}
                href={`/teacher/mentees/${mentee.student.id}`}
                className="flex items-center gap-4 p-4 transition-colors hover:bg-muted"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">
                    {mentee.student.fullName || mentee.student.email}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {mentee.lastCheckInAt
                      ? t('mentor.list.lastCheckIn', { when: ago(mentee.lastCheckInAt) })
                      : t('mentor.list.noCheckIn')}
                  </p>
                </div>
                <Badge variant={STATUS_VARIANT[mentee.status]} className="shrink-0">
                  {t(`mentor.status.${mentee.status}`)}
                </Badge>
                <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
              </Link>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
