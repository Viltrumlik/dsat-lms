// Domain: Support (teacher/staff)
// Description: A teacher's incoming 1:1 bookings — confirm / complete / no-show /
//   cancel and write the post-session outcome (incl. staff-only notes).
'use client'

import * as React from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { format } from 'date-fns'
import { uz as uzDate } from 'date-fns/locale'
import { Inbox } from 'lucide-react'
import { supportAPI, type StatusChangePayload } from '@/lib/api/support'
import { parseApiError } from '@/lib/api/errors'
import { useI18n } from '@/lib/i18n/I18nProvider'
import { useToast } from '@/components/ui/toast'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { BookingStatusBadge } from './BookingStatusBadge'
import type { StaffSupportBooking } from '@/types'

const QK = ['support', 'staff-bookings']

export function StaffBookings() {
  const { t, locale } = useI18n()
  const dfLocale = locale === 'uz' ? uzDate : undefined
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const [completeFor, setCompleteFor] = React.useState<StaffSupportBooking | null>(null)
  const [outcomeFor, setOutcomeFor] = React.useState<StaffSupportBooking | null>(null)

  const { data, isLoading, isError } = useQuery({
    queryKey: QK,
    queryFn: () => supportAPI.staffBookings.list(),
  })

  const act = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: StatusChangePayload }) =>
      supportAPI.staffBookings.changeStatus(id, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QK })
      toast({ variant: 'success', title: t('teacher.support.statusChanged') })
    },
    onError: (err) =>
      toast({
        variant: 'error',
        title: t('teacher.support.actionFailed'),
        description: parseApiError(err).message,
      }),
  })

  if (isLoading) {
    return (
      <Card>
        <CardContent className="space-y-3 p-5">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-10 animate-pulse rounded bg-muted" />
          ))}
        </CardContent>
      </Card>
    )
  }
  if (isError) {
    return (
      <Card>
        <CardContent className="p-5 text-sm text-muted-foreground">
          {t('teacher.support.loadFailed')}
        </CardContent>
      </Card>
    )
  }

  const bookings = data?.data ?? []
  if (bookings.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-3 p-10 text-center">
          <Inbox className="h-8 w-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">{t('teacher.support.empty')}</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <>
      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('teacher.support.student')}</TableHead>
              <TableHead>{t('teacher.support.subject')}</TableHead>
              <TableHead>{t('teacher.support.when')}</TableHead>
              <TableHead>{t('teacher.support.status')}</TableHead>
              <TableHead className="text-right">{t('teacher.support.actions')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {bookings.map((b) => (
              <TableRow key={b.id}>
                <TableCell className="font-medium">{b.student.fullName}</TableCell>
                <TableCell>
                  <Badge variant={b.subject === 'math' ? 'math' : 'rw'}>
                    {t(`support.subject.${b.subject}`)}
                  </Badge>
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {format(new Date(b.scheduledAt), 'PP · HH:mm', { locale: dfLocale })}
                </TableCell>
                <TableCell>
                  <BookingStatusBadge status={b.status} />
                </TableCell>
                <TableCell>
                  <div className="flex flex-wrap justify-end gap-2">
                    {b.status === 'pending' && (
                      <Button
                        size="sm"
                        onClick={() => act.mutate({ id: b.id, payload: { status: 'confirmed' } })}
                      >
                        {t('teacher.support.confirm')}
                      </Button>
                    )}
                    {b.status === 'confirmed' && (
                      <>
                        <Button size="sm" onClick={() => setCompleteFor(b)}>
                          {t('teacher.support.complete')}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => act.mutate({ id: b.id, payload: { status: 'no_show' } })}
                        >
                          {t('teacher.support.noShow')}
                        </Button>
                      </>
                    )}
                    {(b.status === 'pending' || b.status === 'confirmed') && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => act.mutate({ id: b.id, payload: { status: 'cancelled' } })}
                      >
                        {t('teacher.support.cancel')}
                      </Button>
                    )}
                    {(b.status === 'confirmed' || b.status === 'completed') && (
                      <Button size="sm" variant="secondary" onClick={() => setOutcomeFor(b)}>
                        {t('teacher.support.outcome')}
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      <CompleteDialog
        booking={completeFor}
        onDone={() => setCompleteFor(null)}
        onConfirm={(id, minutes) =>
          act.mutate(
            {
              id,
              payload: {
                status: 'completed',
                ...(minutes ? { actualDurationMinutes: minutes } : {}),
              },
            },
            { onSuccess: () => setCompleteFor(null) }
          )
        }
        pending={act.isPending}
      />
      <OutcomeDialog booking={outcomeFor} onDone={() => setOutcomeFor(null)} />
    </>
  )
}

function CompleteDialog({
  booking,
  onDone,
  onConfirm,
  pending,
}: {
  booking: StaffSupportBooking | null
  onDone: () => void
  onConfirm: (id: string, minutes: number | null) => void
  pending: boolean
}) {
  const { t } = useI18n()
  const [minutes, setMinutes] = React.useState('')

  React.useEffect(() => {
    if (booking) setMinutes(String(booking.durationMinutes))
  }, [booking])

  return (
    <Dialog open={!!booking} onOpenChange={(open) => !open && onDone()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('teacher.support.completeTitle')}</DialogTitle>
          <DialogDescription>{t('teacher.support.completeDesc')}</DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="actual-minutes">{t('teacher.support.actualMinutes')}</Label>
          <Input
            id="actual-minutes"
            type="number"
            min={1}
            max={600}
            value={minutes}
            onChange={(e) => setMinutes(e.target.value)}
          />
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onDone}>
            {t('teacher.common.cancel')}
          </Button>
          <Button
            loading={pending}
            onClick={() => booking && onConfirm(booking.id, minutes ? Number(minutes) : null)}
          >
            {t('teacher.support.complete')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function OutcomeDialog({
  booking,
  onDone,
}: {
  booking: StaffSupportBooking | null
  onDone: () => void
}) {
  const { t } = useI18n()
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const [form, setForm] = React.useState({
    topicsCovered: '',
    homework: '',
    nextRecommendation: '',
    notes: '',
  })

  React.useEffect(() => {
    if (booking?.outcome) {
      setForm({
        topicsCovered: booking.outcome.topicsCovered,
        homework: booking.outcome.homework,
        nextRecommendation: booking.outcome.nextRecommendation,
        notes: booking.outcome.notes,
      })
    } else {
      setForm({ topicsCovered: '', homework: '', nextRecommendation: '', notes: '' })
    }
  }, [booking])

  const save = useMutation({
    mutationFn: () => supportAPI.staffBookings.outcome(booking!.id, form),
    onSuccess: () => {
      onDone()
      queryClient.invalidateQueries({ queryKey: QK })
      toast({ variant: 'success', title: t('teacher.support.outcomeSaved') })
    },
    onError: (err) =>
      toast({
        variant: 'error',
        title: t('teacher.support.actionFailed'),
        description: parseApiError(err).message,
      }),
  })

  const field = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLTextAreaElement>) =>
    setForm((prev) => ({ ...prev, [key]: e.target.value }))

  return (
    <Dialog open={!!booking} onOpenChange={(open) => !open && onDone()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('teacher.support.outcomeTitle')}</DialogTitle>
          <DialogDescription>{t('teacher.support.outcomeDesc')}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-2">
            <Label htmlFor="oc-topics">{t('teacher.support.topicsCovered')}</Label>
            <Textarea id="oc-topics" rows={2} value={form.topicsCovered} onChange={field('topicsCovered')} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="oc-homework">{t('teacher.support.homework')}</Label>
            <Textarea id="oc-homework" rows={2} value={form.homework} onChange={field('homework')} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="oc-next">{t('teacher.support.nextRecommendation')}</Label>
            <Textarea id="oc-next" rows={2} value={form.nextRecommendation} onChange={field('nextRecommendation')} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="oc-notes">{t('teacher.support.notes')}</Label>
            <Textarea id="oc-notes" rows={2} value={form.notes} onChange={field('notes')} />
            <p className="text-xs text-muted-foreground">{t('teacher.support.notesHint')}</p>
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onDone}>
            {t('teacher.common.cancel')}
          </Button>
          <Button onClick={() => save.mutate()} loading={save.isPending}>
            {t('teacher.support.saveOutcome')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
