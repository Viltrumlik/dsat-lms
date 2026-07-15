// Domain: Admin (course assignment)
// Description: Assign a course to a class or a student, list existing assignments,
//   and view per-student completion progress. Rendered inside the course builder.
'use client'

import * as React from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { BarChart3, Plus, Trash2, Users } from 'lucide-react'
import { adminCoursesAPI, type CourseAssignmentWritePayload } from '@/lib/api/admin/courses'
import { adminUsersAPI } from '@/lib/api/admin/users'
import { teacherAPI } from '@/lib/api/teacher'
import { parseApiError } from '@/lib/api/errors'
import { useI18n } from '@/lib/i18n/I18nProvider'
import { useToast } from '@/components/ui/toast'
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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'

type Target = 'class' | 'student'

function AssignDialog({
  courseId,
  open,
  onOpenChange,
}: {
  courseId: string
  open: boolean
  onOpenChange: (o: boolean) => void
}) {
  const { t } = useI18n()
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const [target, setTarget] = React.useState<Target>('class')
  const [classId, setClassId] = React.useState('')
  const [studentId, setStudentId] = React.useState('')
  const [opensAt, setOpensAt] = React.useState('')
  const [closesAt, setClosesAt] = React.useState('')

  React.useEffect(() => {
    if (open) {
      setTarget('class')
      setClassId('')
      setStudentId('')
      setOpensAt('')
      setClosesAt('')
    }
  }, [open])

  const classes = useQuery({
    queryKey: ['admin', 'classes-picker'],
    queryFn: () => teacherAPI.classes(),
    enabled: open,
  })
  const students = useQuery({
    queryKey: ['admin', 'students-picker'],
    queryFn: () => adminUsersAPI.list({ role: 'student' }),
    enabled: open,
  })

  const create = useMutation({
    mutationFn: () => {
      const payload: CourseAssignmentWritePayload = {
        course: courseId,
        assignedClass: target === 'class' ? classId : null,
        assignedStudent: target === 'student' ? studentId : null,
        opensAt: opensAt ? new Date(opensAt).toISOString() : null,
        closesAt: closesAt ? new Date(closesAt).toISOString() : null,
      }
      return adminCoursesAPI.createAssignment(payload)
    },
    onSuccess: () => {
      onOpenChange(false)
      queryClient.invalidateQueries({ queryKey: ['admin', 'course-assignments', courseId] })
      toast({ variant: 'success', title: t('admin.courses.assignmentCreated') })
    },
    onError: (err) =>
      toast({
        variant: 'error',
        title: t('admin.courses.actionFailed'),
        description: parseApiError(err).message,
      }),
  })

  const canSubmit = target === 'class' ? !!classId : !!studentId

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('admin.courses.assignTitle')}</DialogTitle>
          <DialogDescription>{t('admin.courses.assignDesc')}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="ca-target">{t('admin.courses.assignTo')}</Label>
            <Select value={target} onValueChange={(v) => setTarget(v as Target)}>
              <SelectTrigger id="ca-target">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="class">{t('admin.courses.targetClass')}</SelectItem>
                <SelectItem value="student">{t('admin.courses.targetStudent')}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {target === 'class' ? (
            <div className="space-y-2">
              <Label htmlFor="ca-class">{t('admin.courses.class')}</Label>
              <Select value={classId} onValueChange={setClassId}>
                <SelectTrigger id="ca-class">
                  <SelectValue placeholder={t('admin.courses.pickClass')} />
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
          ) : (
            <div className="space-y-2">
              <Label htmlFor="ca-student">{t('admin.courses.student')}</Label>
              <Select value={studentId} onValueChange={setStudentId}>
                <SelectTrigger id="ca-student">
                  <SelectValue placeholder={t('admin.courses.pickStudent')} />
                </SelectTrigger>
                <SelectContent>
                  {(students.data?.data ?? []).map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.fullName || s.email}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="ca-opens">{t('admin.courses.opensAt')}</Label>
              <Input
                id="ca-opens"
                type="datetime-local"
                value={opensAt}
                onChange={(e) => setOpensAt(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="ca-closes">{t('admin.courses.closesAt')}</Label>
              <Input
                id="ca-closes"
                type="datetime-local"
                value={closesAt}
                onChange={(e) => setClosesAt(e.target.value)}
              />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('admin.common.cancel')}
          </Button>
          <Button loading={create.isPending} disabled={!canSubmit} onClick={() => create.mutate()}>
            {t('admin.courses.assign')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function ProgressDialog({
  assignmentId,
  open,
  onOpenChange,
}: {
  assignmentId: string | null
  open: boolean
  onOpenChange: (o: boolean) => void
}) {
  const { t } = useI18n()
  const query = useQuery({
    queryKey: ['admin', 'course-assignment-progress', assignmentId],
    queryFn: () => adminCoursesAPI.assignmentProgress(assignmentId as string),
    enabled: open && !!assignmentId,
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('admin.courses.progressTitle')}</DialogTitle>
        </DialogHeader>
        {query.isLoading && <p className="text-sm text-muted-foreground">{t('common.loading')}</p>}
        {query.data && query.data.length === 0 && (
          <p className="text-sm text-muted-foreground">{t('admin.courses.noStudents')}</p>
        )}
        {query.data && query.data.length > 0 && (
          <div className="max-h-96 overflow-y-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('admin.courses.student')}</TableHead>
                  <TableHead>{t('admin.courses.completed')}</TableHead>
                  <TableHead>{t('admin.courses.progress')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {query.data.map((row) => (
                  <TableRow key={row.student.id}>
                    <TableCell className="font-medium">
                      {row.student.fullName || row.student.email}
                    </TableCell>
                    <TableCell className="tabular-nums">
                      {row.completed}/{row.total}
                    </TableCell>
                    <TableCell className="tabular-nums">{row.pct}%</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

export function CourseAssignPanel({ courseId }: { courseId: string }) {
  const { t } = useI18n()
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const [assignOpen, setAssignOpen] = React.useState(false)
  const [progressId, setProgressId] = React.useState<string | null>(null)

  const query = useQuery({
    queryKey: ['admin', 'course-assignments', courseId],
    queryFn: () => adminCoursesAPI.assignments(courseId),
  })
  const assignments = query.data?.data ?? []

  const remove = useMutation({
    mutationFn: (id: string) => adminCoursesAPI.removeAssignment(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'course-assignments', courseId] })
      toast({ variant: 'success', title: t('admin.courses.assignmentRemoved') })
    },
    onError: (err) =>
      toast({
        variant: 'error',
        title: t('admin.courses.actionFailed'),
        description: parseApiError(err).message,
      }),
  })

  return (
    <Card>
      <CardContent className="space-y-3 p-5">
        <div className="flex items-center justify-between">
          <h2 className="flex items-center gap-2 font-semibold">
            <Users className="h-4 w-4" /> {t('admin.courses.assignments')}
          </h2>
          <Button variant="outline" size="sm" onClick={() => setAssignOpen(true)}>
            <Plus className="h-4 w-4" /> {t('admin.courses.assign')}
          </Button>
        </div>

        {query.isLoading ? (
          <div className="space-y-1.5">
            {Array.from({ length: 2 }).map((_, i) => (
              <div key={i} className="h-9 animate-pulse rounded-md bg-muted" />
            ))}
          </div>
        ) : query.isError ? (
          <p className="text-sm text-muted-foreground">{t('admin.courses.loadFailed')}</p>
        ) : assignments.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('admin.courses.noAssignments')}</p>
        ) : (
          <ul className="space-y-1.5">
            {assignments.map((a) => (
              <li
                key={a.id}
                className="flex items-center gap-2 rounded-md border border-border p-2 text-sm"
              >
                <span className="flex-1">
                  {a.assignedClass
                    ? a.assignedClass.name
                    : a.assignedStudent?.fullName || a.assignedStudent?.email}
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={t('admin.courses.viewProgress')}
                  onClick={() => setProgressId(a.id)}
                >
                  <BarChart3 className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={t('admin.courses.removeAssignment')}
                  onClick={() => remove.mutate(a.id)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>

      <AssignDialog courseId={courseId} open={assignOpen} onOpenChange={setAssignOpen} />
      <ProgressDialog
        assignmentId={progressId}
        open={progressId !== null}
        onOpenChange={(o) => {
          if (!o) setProgressId(null)
        }}
      />
    </Card>
  )
}
