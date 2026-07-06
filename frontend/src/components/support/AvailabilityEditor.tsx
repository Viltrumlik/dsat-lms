// Domain: Support (teacher)
// Description: A teacher's weekly availability windows — publishing an active
//   window is how they become bookable. List + add + remove.
'use client'

import * as React from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { format } from 'date-fns'
import { uz as uzDate } from 'date-fns/locale'
import { CalendarClock, Plus, Trash2 } from 'lucide-react'
import { supportAPI, type AvailabilityPayload } from '@/lib/api/support'
import { parseApiError } from '@/lib/api/errors'
import { useI18n } from '@/lib/i18n/I18nProvider'
import { useToast } from '@/components/ui/toast'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { Locale } from '@/lib/i18n/config'
import type { SupportSubject } from '@/types'

const QK = ['support', 'availability']

/** Weekday label (0=Mon … 6=Sun) — 2024-01-01 was a Monday. */
function weekdayLabel(weekday: number, locale: Locale) {
  return format(new Date(2024, 0, 1 + weekday), 'EEEE', {
    locale: locale === 'uz' ? uzDate : undefined,
  })
}

export function AvailabilityEditor() {
  const { t, locale } = useI18n()
  const queryClient = useQueryClient()
  const { toast } = useToast()

  const { data, isLoading, isError } = useQuery({ queryKey: QK, queryFn: supportAPI.availability.list })

  const remove = useMutation({
    mutationFn: (id: string) => supportAPI.availability.remove(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QK })
      toast({ variant: 'success', title: t('teacher.availability.removed') })
    },
    onError: (err) =>
      toast({ variant: 'error', title: t('teacher.availability.failed'), description: parseApiError(err).message }),
  })

  return (
    <div className="space-y-6">
      <AddWindowForm />

      {isLoading && (
        <Card>
          <CardContent className="space-y-3 p-5">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-10 animate-pulse rounded bg-muted" />
            ))}
          </CardContent>
        </Card>
      )}
      {isError && (
        <Card>
          <CardContent className="p-5 text-sm text-muted-foreground">
            {t('teacher.availability.loadFailed')}
          </CardContent>
        </Card>
      )}
      {data && data.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 p-10 text-center">
            <CalendarClock className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">{t('teacher.availability.empty')}</p>
          </CardContent>
        </Card>
      )}
      {data && data.length > 0 && (
        <Card>
          <CardContent className="divide-y divide-border p-0">
            {data.map((a) => (
              <div key={a.id} className="flex items-center justify-between gap-4 p-4">
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="font-medium">{weekdayLabel(a.weekday, locale)}</span>
                  <span className="text-muted-foreground">
                    {a.startTime.slice(0, 5)}–{a.endTime.slice(0, 5)}
                  </span>
                  <Badge variant={a.subject === 'math' ? 'math' : 'rw'}>
                    {t(`support.subject.${a.subject}`)}
                  </Badge>
                  <span className="text-muted-foreground">
                    {t('teacher.availability.slotMinutesShort', { n: a.slotMinutes })}
                  </span>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label={t('teacher.availability.remove')}
                  onClick={() => remove.mutate(a.id)}
                >
                  <Trash2 className="h-4 w-4 text-error" />
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  )
}

function AddWindowForm() {
  const { t, locale } = useI18n()
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const [subject, setSubject] = React.useState<SupportSubject>('math')
  const [weekday, setWeekday] = React.useState('0')
  const [startTime, setStartTime] = React.useState('09:00')
  const [endTime, setEndTime] = React.useState('12:00')
  const [slotMinutes, setSlotMinutes] = React.useState('30')

  const create = useMutation({
    mutationFn: (payload: AvailabilityPayload) => supportAPI.availability.create(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QK })
      toast({ variant: 'success', title: t('teacher.availability.added') })
    },
    onError: (err) =>
      toast({ variant: 'error', title: t('teacher.availability.failed'), description: parseApiError(err).message }),
  })

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    create.mutate({
      subject,
      weekday: Number(weekday),
      startTime,
      endTime,
      slotMinutes: Number(slotMinutes) || 30,
    })
  }

  return (
    <Card>
      <CardContent className="p-5">
        <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-6 lg:items-end">
          <div className="space-y-2">
            <Label>{t('teacher.availability.subject')}</Label>
            <Select value={subject} onValueChange={(v) => setSubject(v as SupportSubject)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="math">{t('support.subject.math')}</SelectItem>
                <SelectItem value="reading_writing">
                  {t('support.subject.reading_writing')}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>{t('teacher.availability.weekday')}</Label>
            <Select value={weekday} onValueChange={setWeekday}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[0, 1, 2, 3, 4, 5, 6].map((wd) => (
                  <SelectItem key={wd} value={String(wd)}>
                    {weekdayLabel(wd, locale)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="av-start">{t('teacher.availability.from')}</Label>
            <Input id="av-start" type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="av-end">{t('teacher.availability.to')}</Label>
            <Input id="av-end" type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="av-slot">{t('teacher.availability.slotMinutes')}</Label>
            <Input
              id="av-slot"
              type="number"
              min={5}
              max={240}
              value={slotMinutes}
              onChange={(e) => setSlotMinutes(e.target.value)}
            />
          </div>
          <Button type="submit" loading={create.isPending}>
            <Plus className="h-4 w-4" /> {t('teacher.availability.add')}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
