// Domain: Support (teacher)
// Description: A teacher's recurring office-hours templates — list + add + remove.
//   The materialize beat turns active templates into dated sessions.
'use client'

import * as React from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { format } from 'date-fns'
import { uz as uzDate } from 'date-fns/locale'
import { CalendarClock, Plus, Trash2 } from 'lucide-react'
import { officeHoursAPI, type OfficeHourPayload } from '@/lib/api/support/officeHours'
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

const QK = ['support', 'office-hour-templates']

function weekdayLabel(weekday: number, locale: Locale) {
  return format(new Date(2024, 0, 1 + weekday), 'EEEE', {
    locale: locale === 'uz' ? uzDate : undefined,
  })
}

export function OfficeHourTemplates() {
  const { t, locale } = useI18n()
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const { data, isLoading } = useQuery({ queryKey: QK, queryFn: officeHoursAPI.templates })

  const remove = useMutation({
    mutationFn: (id: string) => officeHoursAPI.removeTemplate(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QK })
      toast({ variant: 'success', title: t('teacher.officeHours.removed') })
    },
    onError: (err) =>
      toast({ variant: 'error', title: t('teacher.officeHours.failed'), description: parseApiError(err).message }),
  })

  return (
    <div className="space-y-4">
      <AddTemplateForm />
      {isLoading && <div className="h-16 animate-pulse rounded-lg bg-muted" />}
      {data && data.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 p-8 text-center">
            <CalendarClock className="h-7 w-7 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">{t('teacher.officeHours.empty')}</p>
          </CardContent>
        </Card>
      )}
      {data && data.length > 0 && (
        <Card>
          <CardContent className="divide-y divide-border p-0">
            {data.map((oh) => (
              <div key={oh.id} className="flex items-center justify-between gap-4 p-4">
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="font-medium">{oh.title}</span>
                  <span className="text-muted-foreground">
                    {weekdayLabel(oh.weekday, locale)} · {oh.startTime.slice(0, 5)}–
                    {oh.endTime.slice(0, 5)}
                  </span>
                  <Badge variant={oh.subject === 'math' ? 'math' : 'rw'}>
                    {t(`support.subject.${oh.subject}`)}
                  </Badge>
                  <span className="text-muted-foreground">
                    {t('teacher.officeHours.capacityShort', { n: oh.capacity })}
                  </span>
                  {!oh.isActive && (
                    <Badge variant="secondary">{t('teacher.officeHours.inactive')}</Badge>
                  )}
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label={t('teacher.officeHours.remove')}
                  onClick={() => remove.mutate(oh.id)}
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

function AddTemplateForm() {
  const { t, locale } = useI18n()
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const [form, setForm] = React.useState({
    subject: 'math' as SupportSubject,
    title: '',
    weekday: '0',
    startTime: '15:00',
    endTime: '16:00',
    capacity: '25',
  })

  const create = useMutation({
    mutationFn: (payload: OfficeHourPayload) => officeHoursAPI.createTemplate(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QK })
      toast({ variant: 'success', title: t('teacher.officeHours.added') })
    },
    onError: (err) =>
      toast({ variant: 'error', title: t('teacher.officeHours.failed'), description: parseApiError(err).message }),
  })

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.title.trim()) return
    create.mutate({
      subject: form.subject,
      title: form.title.trim(),
      weekday: Number(form.weekday),
      startTime: form.startTime,
      endTime: form.endTime,
      capacity: Number(form.capacity) || 25,
    })
  }

  return (
    <Card>
      <CardContent className="p-5">
        <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-6 lg:items-end">
          <div className="space-y-2 lg:col-span-2">
            <Label htmlFor="oh-title">{t('teacher.officeHours.titleLabel')}</Label>
            <Input
              id="oh-title"
              value={form.title}
              onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))}
              placeholder={t('teacher.officeHours.titlePlaceholder')}
            />
          </div>
          <div className="space-y-2">
            <Label>{t('teacher.officeHours.subject')}</Label>
            <Select
              value={form.subject}
              onValueChange={(v) => setForm((p) => ({ ...p, subject: v as SupportSubject }))}
            >
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
            <Label>{t('teacher.officeHours.weekday')}</Label>
            <Select
              value={form.weekday}
              onValueChange={(v) => setForm((p) => ({ ...p, weekday: v }))}
            >
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
          <div className="grid grid-cols-2 gap-2 lg:col-span-1">
            <div className="space-y-2">
              <Label htmlFor="oh-from">{t('teacher.officeHours.from')}</Label>
              <Input
                id="oh-from"
                type="time"
                value={form.startTime}
                onChange={(e) => setForm((p) => ({ ...p, startTime: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="oh-to">{t('teacher.officeHours.to')}</Label>
              <Input
                id="oh-to"
                type="time"
                value={form.endTime}
                onChange={(e) => setForm((p) => ({ ...p, endTime: e.target.value }))}
              />
            </div>
          </div>
          <Button type="submit" loading={create.isPending}>
            <Plus className="h-4 w-4" /> {t('teacher.officeHours.add')}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
