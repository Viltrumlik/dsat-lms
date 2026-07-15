// Domain: Academy (staff)
// Description: Attendance — pick a class, create dated sessions, and mark each
//   student present/absent/late/excused. Row-scoped server-side (teachers see only
//   their own classes). Backed by /teacher/class-sessions/.
'use client'

import * as React from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { format } from 'date-fns'
import { CalendarPlus, ClipboardCheck } from 'lucide-react'
import { attendanceAPI, type AttendanceMark } from '@/lib/api/attendance'
import { teacherAPI } from '@/lib/api/teacher'
import { parseApiError } from '@/lib/api/errors'
import { useT } from '@/lib/i18n/I18nProvider'
import { useToast } from '@/components/ui/toast'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import type { AttendanceStatus, ClassSession } from '@/types'

const STATUSES: AttendanceStatus[] = ['present', 'absent', 'late', 'excused']

// ── Create-session dialog ──
function NewSessionDialog({
  classId,
  open,
  onOpenChange,
}: {
  classId: string
  open: boolean
  onOpenChange: (o: boolean) => void
}) {
  const t = useT()
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const [title, setTitle] = React.useState('')
  const [startsAt, setStartsAt] = React.useState('')
  const [location, setLocation] = React.useState('')

  React.useEffect(() => {
    if (open) {
      setTitle('')
      setStartsAt('')
      setLocation('')
    }
  }, [open])

  const create = useMutation({
    mutationFn: () =>
      attendanceAPI.createSession({
        klass: classId,
        title: title.trim(),
        startsAt: new Date(startsAt).toISOString(),
        location: location.trim(),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['attendance', 'sessions', classId] })
      onOpenChange(false)
      toast({ variant: 'success', title: t('teacher.attendance.sessionCreated') })
    },
    onError: (err) => toast({ variant: 'error', title: parseApiError(err).message }),
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('teacher.attendance.newSession')}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label htmlFor="s-title">{t('teacher.attendance.sessionTitle')}</Label>
            <Input id="s-title" value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="s-when">{t('teacher.attendance.startsAt')}</Label>
            <Input
              id="s-when"
              type="datetime-local"
              value={startsAt}
              onChange={(e) => setStartsAt(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="s-loc">{t('teacher.attendance.location')}</Label>
            <Input id="s-loc" value={location} onChange={(e) => setLocation(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('admin.common.cancel')}
          </Button>
          <Button loading={create.isPending} disabled={!startsAt} onClick={() => create.mutate()}>
            {t('teacher.attendance.create')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ── Mark-attendance dialog ──
function MarkDialog({
  session,
  open,
  onOpenChange,
}: {
  session: ClassSession
  open: boolean
  onOpenChange: (o: boolean) => void
}) {
  const t = useT()
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const [marks, setMarks] = React.useState<Record<string, AttendanceStatus>>({})

  const detail = useQuery({
    queryKey: ['attendance', 'session', session.id],
    queryFn: () => attendanceAPI.getSession(session.id),
    enabled: open,
  })

  React.useEffect(() => {
    if (detail.data) {
      const seed: Record<string, AttendanceStatus> = {}
      for (const row of detail.data.roster) if (row.status) seed[row.student.id] = row.status
      setMarks(seed)
    }
  }, [detail.data])

  const save = useMutation({
    mutationFn: () => {
      const payload: AttendanceMark[] = Object.entries(marks).map(([student, status]) => ({
        student,
        status,
      }))
      return attendanceAPI.mark(session.id, payload)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['attendance', 'sessions', session.klass] })
      onOpenChange(false)
      toast({ variant: 'success', title: t('teacher.attendance.saved') })
    },
    onError: (err) => toast({ variant: 'error', title: parseApiError(err).message }),
  })

  const roster = detail.data?.roster ?? []

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {t('teacher.attendance.markFor', {
              name: session.klassName,
            })}
          </DialogTitle>
        </DialogHeader>
        {detail.isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-10 animate-pulse rounded bg-muted" />
            ))}
          </div>
        ) : roster.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            {t('teacher.attendance.noStudents')}
          </p>
        ) : (
          <div className="max-h-96 overflow-y-auto">
            <Table>
              <TableBody>
                {roster.map((row) => (
                  <TableRow key={row.student.id}>
                    <TableCell className="font-medium">
                      {row.student.fullName || row.student.email}
                    </TableCell>
                    <TableCell className="w-40">
                      <Select
                        value={marks[row.student.id] ?? ''}
                        onValueChange={(v) =>
                          setMarks((m) => ({ ...m, [row.student.id]: v as AttendanceStatus }))
                        }
                      >
                        <SelectTrigger aria-label={t('teacher.attendance.status')}>
                          <SelectValue placeholder={t('teacher.attendance.unmarked')} />
                        </SelectTrigger>
                        <SelectContent>
                          {STATUSES.map((s) => (
                            <SelectItem key={s} value={s}>
                              {t(`teacher.attendance.statuses.${s}`)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('admin.common.cancel')}
          </Button>
          <Button
            loading={save.isPending}
            disabled={Object.keys(marks).length === 0}
            onClick={() => save.mutate()}
          >
            {t('teacher.attendance.save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function AttendanceView() {
  const t = useT()
  const [classId, setClassId] = React.useState<string>('')
  const [newOpen, setNewOpen] = React.useState(false)
  const [markSession, setMarkSession] = React.useState<ClassSession | null>(null)

  const classes = useQuery({ queryKey: ['teacher', 'classes'], queryFn: teacherAPI.classes })

  React.useEffect(() => {
    if (!classId && classes.data && classes.data.length > 0) setClassId(classes.data[0].id)
  }, [classes.data, classId])

  const sessions = useQuery({
    queryKey: ['attendance', 'sessions', classId],
    queryFn: () => attendanceAPI.listSessions({ classId }),
    enabled: !!classId,
  })

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t('teacher.attendance.title')}</h1>
        <p className="text-muted-foreground">{t('teacher.attendance.subtitle')}</p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Select value={classId} onValueChange={setClassId}>
          <SelectTrigger className="w-64" aria-label={t('teacher.attendance.class')}>
            <SelectValue placeholder={t('teacher.attendance.selectClass')} />
          </SelectTrigger>
          <SelectContent>
            {(classes.data ?? []).map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button disabled={!classId} onClick={() => setNewOpen(true)}>
          <CalendarPlus className="h-4 w-4" /> {t('teacher.attendance.newSession')}
        </Button>
      </div>

      {classId && sessions.isLoading && (
        <Card>
          <CardContent className="space-y-3 p-5">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-10 animate-pulse rounded bg-muted" />
            ))}
          </CardContent>
        </Card>
      )}

      {sessions.data && sessions.data.data.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 p-10 text-center">
            <ClipboardCheck className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">{t('teacher.attendance.noSessions')}</p>
          </CardContent>
        </Card>
      )}

      {sessions.data && sessions.data.data.length > 0 && (
        <Card>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('teacher.attendance.when')}</TableHead>
                  <TableHead>{t('teacher.attendance.sessionTitle')}</TableHead>
                  <TableHead>{t('teacher.attendance.marked')}</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {sessions.data.data.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell className="whitespace-nowrap">
                      {format(new Date(s.startsAt), 'PP p')}
                    </TableCell>
                    <TableCell>{s.title || '—'}</TableCell>
                    <TableCell>
                      <Badge variant="secondary">{s.markedCount}</Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button size="sm" variant="outline" onClick={() => setMarkSession(s)}>
                        <ClipboardCheck className="h-4 w-4" /> {t('teacher.attendance.mark')}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </Card>
      )}

      {classId && (
        <NewSessionDialog classId={classId} open={newOpen} onOpenChange={setNewOpen} />
      )}
      {markSession && (
        <MarkDialog
          session={markSession}
          open
          onOpenChange={(o) => !o && setMarkSession(null)}
        />
      )}
    </div>
  )
}
