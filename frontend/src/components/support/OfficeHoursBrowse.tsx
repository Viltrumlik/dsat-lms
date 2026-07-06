// Domain: Support
// Description: Student office-hours browse — upcoming open group sessions with
//   join/leave (capacity-aware). A joined session shows a Leave action.
'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { format } from 'date-fns'
import { uz as uzDate } from 'date-fns/locale'
import { CalendarClock, MapPin, Users } from 'lucide-react'
import { officeHoursAPI } from '@/lib/api/support/officeHours'
import { parseApiError } from '@/lib/api/errors'
import { useI18n } from '@/lib/i18n/I18nProvider'
import { useToast } from '@/components/ui/toast'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'

const QK = ['support', 'office-hours']

export function OfficeHoursBrowse() {
  const { t, locale } = useI18n()
  const dfLocale = locale === 'uz' ? uzDate : undefined
  const { toast } = useToast()
  const queryClient = useQueryClient()

  const { data, isLoading, isError } = useQuery({
    queryKey: QK,
    queryFn: () => officeHoursAPI.browse(),
  })

  const rsvp = useMutation({
    mutationFn: ({ id, join }: { id: string; join: boolean }) =>
      join ? officeHoursAPI.join(id) : officeHoursAPI.leave(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: QK }),
    onError: (err) =>
      toast({
        variant: 'error',
        title: t('support.officeHours.actionFailed'),
        description: parseApiError(err).message,
      }),
  })

  if (isLoading) {
    return (
      <Card>
        <CardContent className="space-y-3 p-5">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-16 animate-pulse rounded bg-muted" />
          ))}
        </CardContent>
      </Card>
    )
  }
  if (isError) {
    return (
      <Card>
        <CardContent className="p-5 text-sm text-muted-foreground">
          {t('support.officeHours.loadFailed')}
        </CardContent>
      </Card>
    )
  }

  const sessions = data ?? []
  if (sessions.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-3 p-10 text-center">
          <CalendarClock className="h-8 w-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">{t('support.officeHours.empty')}</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-3">
      {sessions.map((s) => (
        <Card key={s.id}>
          <CardContent className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <Badge variant={s.subject === 'math' ? 'math' : 'rw'}>
                  {t(`support.subject.${s.subject}`)}
                </Badge>
                <span className="font-medium">{s.title}</span>
                {s.myRsvp === 'joined' && (
                  <Badge variant="success">{t('support.officeHours.joined')}</Badge>
                )}
              </div>
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <CalendarClock className="h-4 w-4" />
                {format(new Date(s.startsAt), 'PPPP · HH:mm', { locale: dfLocale })}
              </p>
              <p className="text-sm text-muted-foreground">{s.teacher.fullName}</p>
              {s.location && (
                <p className="flex items-center gap-1 text-xs text-muted-foreground">
                  <MapPin className="h-3 w-3" /> {s.location}
                </p>
              )}
              <p className="flex items-center gap-1 text-xs text-muted-foreground">
                <Users className="h-3 w-3" />
                {t('support.officeHours.seats', { left: s.seatsLeft, capacity: s.capacity })}
              </p>
            </div>
            <div className="shrink-0">
              {s.myRsvp === 'joined' ? (
                <Button
                  variant="outline"
                  size="sm"
                  loading={rsvp.isPending}
                  onClick={() => rsvp.mutate({ id: s.id, join: false })}
                >
                  {t('support.officeHours.leave')}
                </Button>
              ) : (
                <Button
                  size="sm"
                  loading={rsvp.isPending}
                  disabled={s.seatsLeft === 0}
                  onClick={() => rsvp.mutate({ id: s.id, join: true })}
                >
                  {s.seatsLeft === 0 ? t('support.officeHours.full') : t('support.officeHours.join')}
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
