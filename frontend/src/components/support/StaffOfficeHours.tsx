// Domain: Support (teacher/staff)
// Description: A teacher's upcoming office-hours sessions — view the roster, mark
//   attendance, and cancel (which notifies joined students). Row-scoped server-side.
'use client'

import * as React from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { format } from 'date-fns'
import { uz as uzDate } from 'date-fns/locale'
import { CalendarClock, Users } from 'lucide-react'
import { officeHoursAPI } from '@/lib/api/support/officeHours'
import { parseApiError } from '@/lib/api/errors'
import { useI18n } from '@/lib/i18n/I18nProvider'
import { useToast } from '@/components/ui/toast'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import type { OfficeHourStatus } from '@/types'

const QK = ['support', 'staff-office-hours']

const STATUS_VARIANT: Record<OfficeHourStatus, 'default' | 'secondary' | 'success'> = {
  scheduled: 'default',
  canceled: 'secondary',
  completed: 'success',
}

function RosterDialog({ sessionId, onClose }: { sessionId: string | null; onClose: () => void }) {
  const { t } = useI18n()
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const rosterQk = ['support', 'office-hours-roster', sessionId]

  const { data: session } = useQuery({
    queryKey: rosterQk,
    queryFn: () => officeHoursAPI.roster(sessionId as string),
    enabled: !!sessionId,
  })

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: rosterQk })
    queryClient.invalidateQueries({ queryKey: QK })
  }
  const onError = (err: unknown) =>
    toast({ variant: 'error', title: t('teacher.officeHours.actionFailed'), description: parseApiError(err).message })

  const mark = useMutation({
    mutationFn: ({ student, attended }: { student: string; attended: boolean }) =>
      officeHoursAPI.markAttendance(sessionId as string, student, attended),
    onSuccess: invalidate,
    onError,
  })
  const cancel = useMutation({
    mutationFn: () => officeHoursAPI.cancel(sessionId as string),
    onSuccess: () => {
      invalidate()
      onClose()
      toast({ variant: 'success', title: t('teacher.officeHours.canceled') })
    },
    onError,
  })

  return (
    <Dialog open={!!sessionId} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{session?.title ?? t('teacher.officeHours.roster')}</DialogTitle>
        </DialogHeader>
        {session && (
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-4">
              <p className="text-sm text-muted-foreground">
                {t('teacher.officeHours.attendeeCount', {
                  n: session.attendees.length,
                  capacity: session.capacity,
                })}
              </p>
              {session.status === 'scheduled' && (
                <Button
                  variant="destructive"
                  size="sm"
                  loading={cancel.isPending}
                  onClick={() => cancel.mutate()}
                >
                  {t('teacher.officeHours.cancel')}
                </Button>
              )}
            </div>
            {session.attendees.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t('teacher.officeHours.noAttendees')}</p>
            ) : (
              <div className="divide-y divide-border">
                {session.attendees.map((a) => (
                  <label key={a.id} className="flex items-center gap-3 py-2 text-sm">
                    <Checkbox
                      checked={a.attended}
                      onCheckedChange={(v) => mark.mutate({ student: a.student.id, attended: !!v })}
                    />
                    {a.student.fullName}
                  </label>
                ))}
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

export function StaffOfficeHours() {
  const { t, locale } = useI18n()
  const dfLocale = locale === 'uz' ? uzDate : undefined
  const [openId, setOpenId] = React.useState<string | null>(null)

  const { data, isLoading, isError } = useQuery({ queryKey: QK, queryFn: officeHoursAPI.staffSessions })

  if (isLoading) return <div className="h-16 animate-pulse rounded-lg bg-muted" />
  if (isError) {
    return (
      <Card>
        <CardContent className="p-5 text-sm text-muted-foreground">
          {t('teacher.officeHours.loadFailed')}
        </CardContent>
      </Card>
    )
  }

  const sessions = data ?? []
  if (sessions.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-2 p-8 text-center">
          <CalendarClock className="h-7 w-7 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">{t('teacher.officeHours.noSessions')}</p>
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
                <span className="font-medium">{s.title}</span>
                <Badge variant={STATUS_VARIANT[s.status]}>
                  {t(`teacher.officeHours.status.${s.status}`)}
                </Badge>
              </div>
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <CalendarClock className="h-4 w-4" />
                {format(new Date(s.startsAt), 'PP · HH:mm', { locale: dfLocale })}
              </p>
              <p className="flex items-center gap-1 text-xs text-muted-foreground">
                <Users className="h-3 w-3" />
                {t('teacher.officeHours.joinedCount', { n: s.joinedCount, capacity: s.capacity })}
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={() => setOpenId(s.id)}>
              {t('teacher.officeHours.roster')}
            </Button>
          </CardContent>
        </Card>
      ))}

      <RosterDialog sessionId={openId} onClose={() => setOpenId(null)} />
    </div>
  )
}
