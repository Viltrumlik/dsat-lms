// Domain: Support
// Description: A student's 1:1 sessions — upcoming + past, with cancel (live
//   bookings) and rate (completed, unrated) actions and the teacher's outcome.
'use client'

import * as React from 'react'
import Link from 'next/link'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { format } from 'date-fns'
import { uz as uzDate } from 'date-fns/locale'
import { CalendarPlus, Star, User } from 'lucide-react'
import { supportAPI } from '@/lib/api/support'
import { parseApiError } from '@/lib/api/errors'
import { useI18n } from '@/lib/i18n/I18nProvider'
import { useToast } from '@/components/ui/toast'
import { Badge } from '@/components/ui/badge'
import { Button, buttonVariants } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { BookingStatusBadge } from './BookingStatusBadge'
import { RatingDialog } from './RatingDialog'
import type { SupportBooking } from '@/types'

const LIVE = new Set(['pending', 'confirmed'])

export function SessionsList() {
  const { t, locale } = useI18n()
  const dfLocale = locale === 'uz' ? uzDate : undefined
  const [rateFor, setRateFor] = React.useState<string | null>(null)
  const [cancelFor, setCancelFor] = React.useState<SupportBooking | null>(null)

  const { data, isLoading, isError } = useQuery({
    queryKey: ['support', 'my-bookings'],
    queryFn: () => supportAPI.bookings.list(),
  })

  if (isLoading) {
    return (
      <Card>
        <CardContent className="space-y-3 p-5">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-14 animate-pulse rounded bg-muted" />
          ))}
        </CardContent>
      </Card>
    )
  }
  if (isError) {
    return (
      <Card>
        <CardContent className="p-5 text-sm text-muted-foreground">
          {t('support.sessions.loadFailed')}
        </CardContent>
      </Card>
    )
  }

  const bookings = data?.data ?? []
  if (bookings.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-3 p-10 text-center">
          <CalendarPlus className="h-8 w-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">{t('support.sessions.empty')}</p>
          <Link href="/support/book" className={buttonVariants()}>
            {t('support.sessions.bookCta')}
          </Link>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-3">
      {bookings.map((b) => (
        <Card key={b.id}>
          <CardContent className="flex flex-col gap-3 p-5 sm:flex-row sm:items-start sm:justify-between">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <BookingStatusBadge status={b.status} />
                <Badge variant={b.subject === 'math' ? 'math' : 'rw'}>
                  {t(`support.subject.${b.subject}`)}
                </Badge>
              </div>
              <p className="flex items-center gap-2 text-sm font-medium">
                <User className="h-4 w-4 text-muted-foreground" />
                {b.teacher.fullName}
              </p>
              <p className="text-sm text-muted-foreground">
                {format(new Date(b.scheduledAt), 'PPPP · HH:mm', { locale: dfLocale })}
              </p>
              {b.topic && <p className="text-sm">{b.topic}</p>}
              {b.outcome && (
                <div className="mt-2 rounded-md bg-muted p-3 text-sm">
                  <p className="font-medium">{t('support.sessions.outcomeTitle')}</p>
                  {b.outcome.topicsCovered && (
                    <p>
                      <span className="text-muted-foreground">
                        {t('support.sessions.topicsCovered')}:{' '}
                      </span>
                      {b.outcome.topicsCovered}
                    </p>
                  )}
                  {b.outcome.homework && (
                    <p>
                      <span className="text-muted-foreground">
                        {t('support.sessions.homework')}:{' '}
                      </span>
                      {b.outcome.homework}
                    </p>
                  )}
                  {b.outcome.nextRecommendation && (
                    <p>
                      <span className="text-muted-foreground">
                        {t('support.sessions.nextRecommendation')}:{' '}
                      </span>
                      {b.outcome.nextRecommendation}
                    </p>
                  )}
                </div>
              )}
              {b.rating && (
                <p className="mt-1 flex items-center gap-1 text-sm text-warning">
                  <Star className="h-4 w-4 fill-warning" /> {b.rating.score}/5
                </p>
              )}
            </div>
            <div className="flex shrink-0 gap-2">
              {LIVE.has(b.status) && (
                <Button variant="outline" size="sm" onClick={() => setCancelFor(b)}>
                  {t('support.sessions.cancel')}
                </Button>
              )}
              {b.status === 'completed' && !b.rating && (
                <Button size="sm" onClick={() => setRateFor(b.id)}>
                  <Star className="h-4 w-4" /> {t('support.sessions.rate')}
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      ))}

      {rateFor && (
        <RatingDialog
          bookingId={rateFor}
          open={!!rateFor}
          onOpenChange={(open) => !open && setRateFor(null)}
        />
      )}
      <CancelDialog booking={cancelFor} onDone={() => setCancelFor(null)} />
    </div>
  )
}

function CancelDialog({
  booking,
  onDone,
}: {
  booking: SupportBooking | null
  onDone: () => void
}) {
  const { t } = useI18n()
  const { toast } = useToast()
  const queryClient = useQueryClient()

  const cancel = useMutation({
    mutationFn: () => supportAPI.bookings.cancel(booking!.id),
    onSuccess: () => {
      onDone()
      queryClient.invalidateQueries({ queryKey: ['support', 'my-bookings'] })
      toast({ variant: 'success', title: t('support.sessions.cancelled') })
    },
    onError: (err) =>
      toast({
        variant: 'error',
        title: t('support.sessions.cancelFailed'),
        description: parseApiError(err).message,
      }),
  })

  return (
    <Dialog open={!!booking} onOpenChange={(open) => !open && onDone()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('support.sessions.cancelTitle')}</DialogTitle>
          <DialogDescription>{t('support.sessions.cancelConfirm')}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onDone}>
            {t('support.sessions.keep')}
          </Button>
          <Button variant="destructive" onClick={() => cancel.mutate()} loading={cancel.isPending}>
            {t('support.sessions.cancel')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
