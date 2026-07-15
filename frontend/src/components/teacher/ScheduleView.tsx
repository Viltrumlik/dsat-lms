// Domain: Academy (staff)
// Description: Class schedule — set recurring weekly rules (which a daily task
//   materializes into dated sessions) and see upcoming sessions across your classes.
//   Backed by /teacher/classes/<id>/schedule-rules/ + /teacher/class-sessions/.
'use client'

import * as React from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { format } from 'date-fns'
import { Plus, Trash2 } from 'lucide-react'
import { attendanceAPI } from '@/lib/api/attendance'
import { teacherAPI } from '@/lib/api/teacher'
import { parseApiError } from '@/lib/api/errors'
import { useT } from '@/lib/i18n/I18nProvider'
import { useToast } from '@/components/ui/toast'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { ClassSession } from '@/types'

const WEEKDAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const

// ── Recurring-rules editor for one class ──
function RulesEditor({ classId }: { classId: string }) {
  const t = useT()
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const [weekday, setWeekday] = React.useState('0')
  const [startTime, setStartTime] = React.useState('')
  const [endTime, setEndTime] = React.useState('')
  const [title, setTitle] = React.useState('')

  const rules = useQuery({
    queryKey: ['schedule', 'rules', classId],
    queryFn: () => attendanceAPI.listRules(classId),
  })

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ['schedule', 'rules', classId] })

  const add = useMutation({
    mutationFn: () =>
      attendanceAPI.createRule(classId, {
        weekday: Number(weekday),
        startTime,
        endTime: endTime || null,
        title: title.trim(),
      }),
    onSuccess: () => {
      invalidate()
      setStartTime('')
      setEndTime('')
      setTitle('')
      toast({ variant: 'success', title: t('teacher.schedule.ruleAdded') })
    },
    onError: (err) => toast({ variant: 'error', title: parseApiError(err).message }),
  })

  const remove = useMutation({
    mutationFn: (id: string) => attendanceAPI.deleteRule(id),
    onSuccess: invalidate,
    onError: (err) => toast({ variant: 'error', title: parseApiError(err).message }),
  })

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('teacher.schedule.rules')}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {(rules.data ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('teacher.schedule.noRules')}</p>
        ) : (
          <ul className="divide-y divide-border">
            {(rules.data ?? []).map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                <span>
                  <span className="font-medium">
                    {t(`teacher.schedule.weekdays.${WEEKDAY_KEYS[r.weekday]}`)}
                  </span>{' '}
                  {r.startTime.slice(0, 5)}
                  {r.endTime ? `–${r.endTime.slice(0, 5)}` : ''}
                  {r.title ? ` · ${r.title}` : ''}
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={t('teacher.schedule.remove')}
                  onClick={() => remove.mutate(r.id)}
                >
                  <Trash2 className="h-4 w-4 text-error" />
                </Button>
              </li>
            ))}
          </ul>
        )}

        <form
          className="grid gap-3 sm:grid-cols-5 sm:items-end"
          onSubmit={(e) => {
            e.preventDefault()
            if (startTime) add.mutate()
          }}
        >
          <div className="sm:col-span-1">
            <Label>{t('teacher.schedule.weekday')}</Label>
            <Select value={weekday} onValueChange={setWeekday}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {WEEKDAY_KEYS.map((k, i) => (
                  <SelectItem key={k} value={String(i)}>
                    {t(`teacher.schedule.weekdays.${k}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="r-start">{t('teacher.schedule.start')}</Label>
            <Input
              id="r-start"
              type="time"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="r-end">{t('teacher.schedule.end')}</Label>
            <Input
              id="r-end"
              type="time"
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="r-title">{t('teacher.schedule.ruleTitle')}</Label>
            <Input id="r-title" value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <Button type="submit" loading={add.isPending} disabled={!startTime}>
            <Plus className="h-4 w-4" /> {t('teacher.schedule.add')}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}

// ── Upcoming sessions across classes ──
function UpcomingSessions() {
  const t = useT()
  const range = React.useMemo(() => {
    const now = new Date()
    const to = new Date(now.getTime() + 14 * 24 * 3600 * 1000)
    return { from: now.toISOString(), to: to.toISOString() }
  }, [])

  const sessions = useQuery({
    queryKey: ['schedule', 'upcoming'],
    queryFn: () => attendanceAPI.listSessions({ from: range.from, to: range.to }),
  })

  const byDay = React.useMemo(() => {
    const rows = sessions.data?.data ?? []
    const sorted = [...rows].sort((a, b) => a.startsAt.localeCompare(b.startsAt))
    const groups: { day: string; items: ClassSession[] }[] = []
    for (const s of sorted) {
      const day = format(new Date(s.startsAt), 'EEEE, PP')
      const g = groups.find((x) => x.day === day)
      if (g) g.items.push(s)
      else groups.push({ day, items: [s] })
    }
    return groups
  }, [sessions.data])

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('teacher.schedule.upcoming')}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {byDay.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('teacher.schedule.noUpcoming')}</p>
        ) : (
          byDay.map((g) => (
            <div key={g.day}>
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {g.day}
              </p>
              <ul className="space-y-1">
                {g.items.map((s) => (
                  <li key={s.id} className="flex items-center gap-2 text-sm">
                    <span className="tabular-nums text-muted-foreground">
                      {format(new Date(s.startsAt), 'p')}
                    </span>
                    <span className="font-medium">{s.klassName}</span>
                    {s.title && <span className="text-muted-foreground">· {s.title}</span>}
                  </li>
                ))}
              </ul>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  )
}

export function ScheduleView() {
  const t = useT()
  const [classId, setClassId] = React.useState('')
  const classes = useQuery({ queryKey: ['teacher', 'classes'], queryFn: teacherAPI.classes })

  React.useEffect(() => {
    if (!classId && classes.data && classes.data.length > 0) setClassId(classes.data[0].id)
  }, [classes.data, classId])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t('teacher.schedule.title')}</h1>
        <p className="text-muted-foreground">{t('teacher.schedule.subtitle')}</p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Select value={classId} onValueChange={setClassId}>
          <SelectTrigger className="w-64" aria-label={t('teacher.schedule.class')}>
            <SelectValue placeholder={t('teacher.schedule.selectClass')} />
          </SelectTrigger>
          <SelectContent>
            {(classes.data ?? []).map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {classId && <RulesEditor classId={classId} />}
      <UpcomingSessions />
    </div>
  )
}
