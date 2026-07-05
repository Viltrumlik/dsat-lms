// Domain: Admin (exam assignments)
// Description: Assign an exam to a class or a student (schedule + attempts), list
//   assignments, and view per-student progress. Class list reuses the teacher
//   endpoint (admins see all classes); students come from the admin users list.
'use client'

import * as React from 'react'
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { format } from 'date-fns'
import { uz as uzDate } from 'date-fns/locale'
import { BarChart3, Pencil, Plus, Trash2 } from 'lucide-react'
import { adminAssignmentsAPI, adminExamsAPI, type AssignmentWritePayload } from '@/lib/api/admin/exams'
import { adminUsersAPI } from '@/lib/api/admin/users'
import { cursorFromUrl } from '@/lib/api/client'
import { teacherAPI } from '@/lib/api/teacher'
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import type { AdminAssignment } from '@/types'

// ── Create dialog ──
function CreateAssignmentDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { t } = useI18n()
  const { toast } = useToast()
  const queryClient = useQueryClient()

  const [exam, setExam] = React.useState('')
  const [target, setTarget] = React.useState<'class' | 'student'>('class')
  const [classId, setClassId] = React.useState('')
  const [studentId, setStudentId] = React.useState('')
  const [opensAt, setOpensAt] = React.useState('')
  const [closesAt, setClosesAt] = React.useState('')
  const [maxAttempts, setMaxAttempts] = React.useState(1)
  const [instructions, setInstructions] = React.useState('')

  React.useEffect(() => {
    if (open) {
      setExam('')
      setTarget('class')
      setClassId('')
      setStudentId('')
      setOpensAt('')
      setClosesAt('')
      setMaxAttempts(1)
      setInstructions('')
    }
  }, [open])

  const exams = useQuery({ queryKey: ['admin', 'exams-picker'], queryFn: () => adminExamsAPI.list(), enabled: open })
  const classes = useQuery({ queryKey: ['admin', 'classes-picker'], queryFn: () => teacherAPI.classes(), enabled: open })
  const students = useQuery({
    queryKey: ['admin', 'students-picker'],
    queryFn: () => adminUsersAPI.list({ role: 'student' }),
    enabled: open,
  })

  const create = useMutation({
    mutationFn: () => {
      const payload: AssignmentWritePayload = {
        exam,
        opensAt,
        closesAt,
        maxAttempts,
        instructions: instructions.trim() || null,
        ...(target === 'class' ? { assignedClass: classId } : { assignedStudent: studentId }),
      }
      return adminAssignmentsAPI.create(payload)
    },
    onSuccess: () => {
      onOpenChange(false)
      queryClient.invalidateQueries({ queryKey: ['admin', 'assignments'] })
      toast({ variant: 'success', title: t('admin.assignments.created') })
    },
    onError: (err) =>
      toast({ variant: 'error', title: t('admin.assignments.createFailed'), description: parseApiError(err).message }),
  })

  const canSubmit = exam && opensAt && closesAt && (target === 'class' ? classId : studentId)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('admin.assignments.createTitle')}</DialogTitle>
          <DialogDescription>{t('admin.assignments.createDesc')}</DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault()
            if (canSubmit) create.mutate()
          }}
        >
          <div className="space-y-2">
            <Label htmlFor="as-exam">{t('admin.assignments.exam')}</Label>
            <Select value={exam} onValueChange={setExam}>
              <SelectTrigger id="as-exam">
                <SelectValue placeholder={t('admin.assignments.pickExam')} />
              </SelectTrigger>
              <SelectContent>
                {(exams.data?.data ?? []).map((ex) => (
                  <SelectItem key={ex.id} value={ex.id}>
                    {ex.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="as-target">{t('admin.assignments.target')}</Label>
              <Select value={target} onValueChange={(v) => setTarget(v as 'class' | 'student')}>
                <SelectTrigger id="as-target">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="class">{t('admin.assignments.targetClass')}</SelectItem>
                  <SelectItem value="student">{t('admin.assignments.targetStudent')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="as-who">
                {target === 'class' ? t('admin.assignments.targetClass') : t('admin.assignments.targetStudent')}
              </Label>
              {target === 'class' ? (
                <Select value={classId} onValueChange={setClassId}>
                  <SelectTrigger id="as-who">
                    <SelectValue placeholder={t('admin.assignments.pickClass')} />
                  </SelectTrigger>
                  <SelectContent>
                    {(classes.data ?? []).map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Select value={studentId} onValueChange={setStudentId}>
                  <SelectTrigger id="as-who">
                    <SelectValue placeholder={t('admin.assignments.pickStudent')} />
                  </SelectTrigger>
                  <SelectContent>
                    {(students.data?.data ?? []).map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.fullName || s.email}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="as-opens">{t('admin.assignments.opensAt')}</Label>
              <Input id="as-opens" type="datetime-local" value={opensAt} onChange={(e) => setOpensAt(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="as-closes">{t('admin.assignments.closesAt')}</Label>
              <Input id="as-closes" type="datetime-local" value={closesAt} onChange={(e) => setClosesAt(e.target.value)} />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="as-attempts">{t('admin.assignments.maxAttempts')}</Label>
            <Input
              id="as-attempts"
              type="number"
              min={1}
              value={maxAttempts}
              onChange={(e) => setMaxAttempts(Math.max(1, Number(e.target.value) || 1))}
              className="w-24"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="as-instructions">{t('admin.assignments.instructions')}</Label>
            <Textarea
              id="as-instructions"
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              rows={2}
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {t('admin.common.cancel')}
            </Button>
            <Button type="submit" loading={create.isPending} disabled={!canSubmit}>
              {t('admin.assignments.assign')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ── Progress dialog ──
function ProgressDialog({
  assignment,
  open,
  onOpenChange,
}: {
  assignment: AdminAssignment
  open: boolean
  onOpenChange: (o: boolean) => void
}) {
  const { t } = useI18n()
  const sessions = useQuery({
    queryKey: ['admin', 'assignment-sessions', assignment.id],
    queryFn: () => adminAssignmentsAPI.sessions(assignment.id),
    enabled: open,
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('admin.assignments.progressTitle')}</DialogTitle>
          <DialogDescription>{assignment.exam.title}</DialogDescription>
        </DialogHeader>
        {sessions.isLoading && <p className="text-sm text-muted-foreground">{t('common.loading')}</p>}
        {sessions.data && sessions.data.length === 0 && (
          <p className="text-sm text-muted-foreground">{t('admin.assignments.noSessions')}</p>
        )}
        {sessions.data && sessions.data.length > 0 && (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('admin.assignments.student')}</TableHead>
                <TableHead>{t('admin.assignments.status')}</TableHead>
                <TableHead>{t('admin.assignments.score')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sessions.data.map((s) => (
                <TableRow key={s.id}>
                  <TableCell>{s.student.fullName || s.student.email}</TableCell>
                  <TableCell>
                    <Badge variant={s.status === 'completed' ? 'success' : 'secondary'}>
                      {t(`admin.assignments.sessionStatus.${s.status}`)}
                    </Badge>
                  </TableCell>
                  <TableCell className="tabular-nums">{s.totalScore ?? '—'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </DialogContent>
    </Dialog>
  )
}

// ── Edit dialog (schedule / attempts / instructions) ──
function EditAssignmentDialog({
  assignment,
  open,
  onOpenChange,
}: {
  assignment: AdminAssignment
  open: boolean
  onOpenChange: (o: boolean) => void
}) {
  const { t } = useI18n()
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const [opensAt, setOpensAt] = React.useState('')
  const [closesAt, setClosesAt] = React.useState('')
  const [maxAttempts, setMaxAttempts] = React.useState(1)
  const [instructions, setInstructions] = React.useState('')

  React.useEffect(() => {
    if (!open) return
    setOpensAt(assignment.opensAt.slice(0, 16))
    setClosesAt(assignment.closesAt.slice(0, 16))
    setMaxAttempts(assignment.maxAttempts)
    setInstructions(assignment.instructions ?? '')
  }, [open, assignment])

  const save = useMutation({
    mutationFn: () =>
      adminAssignmentsAPI.update(assignment.id, {
        opensAt,
        closesAt,
        maxAttempts,
        instructions: instructions.trim() || null,
      }),
    onSuccess: () => {
      onOpenChange(false)
      queryClient.invalidateQueries({ queryKey: ['admin', 'assignments'] })
      toast({ variant: 'success', title: t('admin.assignments.updated') })
    },
    onError: (err) =>
      toast({ variant: 'error', title: t('admin.assignments.actionFailed'), description: parseApiError(err).message }),
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('admin.assignments.editTitle')}</DialogTitle>
          <DialogDescription>{assignment.exam.title}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="ea-opens">{t('admin.assignments.opensAt')}</Label>
              <Input id="ea-opens" type="datetime-local" value={opensAt} onChange={(e) => setOpensAt(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="ea-closes">{t('admin.assignments.closesAt')}</Label>
              <Input id="ea-closes" type="datetime-local" value={closesAt} onChange={(e) => setClosesAt(e.target.value)} />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="ea-attempts">{t('admin.assignments.maxAttempts')}</Label>
            <Input
              id="ea-attempts"
              type="number"
              min={1}
              value={maxAttempts}
              onChange={(e) => setMaxAttempts(Math.max(1, Number(e.target.value) || 1))}
              className="w-24"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="ea-instructions">{t('admin.assignments.instructions')}</Label>
            <Textarea id="ea-instructions" value={instructions} onChange={(e) => setInstructions(e.target.value)} rows={2} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('admin.common.cancel')}
          </Button>
          <Button loading={save.isPending} onClick={() => save.mutate()}>
            {t('admin.assignments.save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function AssignmentsView() {
  const { t, locale } = useI18n()
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const [createOpen, setCreateOpen] = React.useState(false)
  const [progressFor, setProgressFor] = React.useState<AdminAssignment | null>(null)
  const [editFor, setEditFor] = React.useState<AdminAssignment | null>(null)

  const query = useInfiniteQuery({
    queryKey: ['admin', 'assignments'],
    queryFn: ({ pageParam }) => adminAssignmentsAPI.list({ cursor: pageParam }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => cursorFromUrl(last.pagination?.next ?? null) ?? undefined,
  })
  const assignments = query.data?.pages.flatMap((p) => p.data) ?? []

  const remove = useMutation({
    mutationFn: (id: string) => adminAssignmentsAPI.remove(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'assignments'] })
      toast({ variant: 'success', title: t('admin.assignments.deleted') })
    },
    onError: (err) =>
      toast({ variant: 'error', title: t('admin.assignments.actionFailed'), description: parseApiError(err).message }),
  })

  const fmt = (iso: string) => format(new Date(iso), 'PP p', { locale: locale === 'uz' ? uzDate : undefined })

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4" /> {t('admin.assignments.assign')}
        </Button>
      </div>

      {query.isLoading && (
        <Card>
          <CardContent className="space-y-3 p-5">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-10 animate-pulse rounded bg-muted" />
            ))}
          </CardContent>
        </Card>
      )}

      {query.isError && (
        <Card>
          <CardContent className="flex flex-wrap items-center justify-between gap-3 p-5 text-sm text-muted-foreground">
            {t('admin.assignments.loadFailed')}
            <Button variant="outline" size="sm" onClick={() => query.refetch()}>
              {t('common.tryAgain')}
            </Button>
          </CardContent>
        </Card>
      )}

      {query.data && assignments.length === 0 && (
        <Card>
          <CardContent className="p-10 text-center text-sm text-muted-foreground">
            {t('admin.assignments.empty')}
          </CardContent>
        </Card>
      )}

      {query.data && assignments.length > 0 && (
        <Card>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('admin.assignments.exam')}</TableHead>
                  <TableHead>{t('admin.assignments.assignedTo')}</TableHead>
                  <TableHead>{t('admin.assignments.opensAt')}</TableHead>
                  <TableHead>{t('admin.assignments.closesAt')}</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {assignments.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell className="font-medium">{a.exam.title}</TableCell>
                    <TableCell>
                      {a.assignedClass ? (
                        <Badge variant="secondary">{a.assignedClass.name}</Badge>
                      ) : (
                        <span>{a.assignedStudent?.fullName || a.assignedStudent?.email}</span>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{fmt(a.opensAt)}</TableCell>
                    <TableCell className="text-muted-foreground">{fmt(a.closesAt)}</TableCell>
                    <TableCell className="w-36 whitespace-nowrap text-right">
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={t('admin.assignments.progress')}
                        onClick={() => setProgressFor(a)}
                      >
                        <BarChart3 className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={t('admin.assignments.edit')}
                        onClick={() => setEditFor(a)}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={t('admin.assignments.delete')}
                        onClick={() => remove.mutate(a.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </Card>
      )}

      {query.hasNextPage && (
        <div className="flex justify-center">
          <Button variant="outline" loading={query.isFetchingNextPage} onClick={() => query.fetchNextPage()}>
            {t('admin.assignments.loadMore')}
          </Button>
        </div>
      )}

      <CreateAssignmentDialog open={createOpen} onOpenChange={setCreateOpen} />
      {progressFor && (
        <ProgressDialog
          assignment={progressFor}
          open
          onOpenChange={(o) => !o && setProgressFor(null)}
        />
      )}
      {editFor && (
        <EditAssignmentDialog assignment={editFor} open onOpenChange={(o) => !o && setEditFor(null)} />
      )}
    </div>
  )
}
