// Domain: Admin (course builder)
// Description: Assemble a course — edit meta + publish/archive, add/remove/reorder
//   units, and within each unit add/remove/reorder lessons (edited in a side sheet).
'use client'

import * as React from 'react'
import Link from 'next/link'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowDown, ArrowLeft, ArrowUp, FileText, Pencil, Plus, Trash2 } from 'lucide-react'
import {
  adminCoursesAPI,
  type CoursePublishAction,
  type CourseWritePayload,
} from '@/lib/api/admin/courses'
import { parseApiError } from '@/lib/api/errors'
import { useI18n } from '@/lib/i18n/I18nProvider'
import { useToast } from '@/components/ui/toast'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
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
import { FullPageSpinner } from '@/components/ui/spinner'
import { LessonEditor } from '@/components/admin/LessonEditor'
import type { AdminCourse, AdminCourseUnit, CourseStatus, CourseSubject } from '@/types'

const SUBJECTS: CourseSubject[] = ['math', 'reading_writing', 'general']
const STATUS_VARIANT: Record<CourseStatus, 'secondary' | 'success' | 'outline'> = {
  draft: 'secondary',
  published: 'success',
  archived: 'outline',
}

// ── Edit course meta ──
function EditCourseDialog({
  course,
  open,
  onOpenChange,
}: {
  course: AdminCourse
  open: boolean
  onOpenChange: (o: boolean) => void
}) {
  const { t } = useI18n()
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const [form, setForm] = React.useState<CourseWritePayload>({
    title: course.title,
    subject: course.subject,
    description: course.description,
  })

  React.useEffect(() => {
    if (open) setForm({ title: course.title, subject: course.subject, description: course.description })
  }, [open, course])

  const save = useMutation({
    mutationFn: () => adminCoursesAPI.update(course.id, form),
    onSuccess: () => {
      onOpenChange(false)
      queryClient.invalidateQueries({ queryKey: ['admin', 'course', course.id] })
      queryClient.invalidateQueries({ queryKey: ['admin', 'courses'] })
      toast({ variant: 'success', title: t('admin.courses.updated') })
    },
    onError: (err) =>
      toast({
        variant: 'error',
        title: t('admin.courses.actionFailed'),
        description: parseApiError(err).message,
      }),
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('admin.courses.editTitle')}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="ec-title">{t('admin.courses.courseTitle')}</Label>
            <Input
              id="ec-title"
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="ec-subject">{t('admin.courses.subject')}</Label>
            <Select
              value={form.subject}
              onValueChange={(v) => setForm((f) => ({ ...f, subject: v as CourseSubject }))}
            >
              <SelectTrigger id="ec-subject">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SUBJECTS.map((s) => (
                  <SelectItem key={s} value={s}>
                    {t(`admin.courses.subjectLabel.${s}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="ec-desc">{t('admin.courses.description')}</Label>
            <Input
              id="ec-desc"
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('admin.common.cancel')}
          </Button>
          <Button loading={save.isPending} disabled={!form.title.trim()} onClick={() => save.mutate()}>
            {t('admin.courses.save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ── Unit card (with its lessons) ──
function UnitCard({
  courseId,
  unit,
  index,
  count,
  onMove,
  onEditLesson,
}: {
  courseId: string
  unit: AdminCourseUnit
  index: number
  count: number
  onMove: (index: number, dir: -1 | 1) => void
  onEditLesson: (lessonId: string) => void
}) {
  const { t } = useI18n()
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const [newLesson, setNewLesson] = React.useState('')

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['admin', 'course', courseId] })
  const onError = (err: unknown) =>
    toast({
      variant: 'error',
      title: t('admin.courses.actionFailed'),
      description: parseApiError(err).message,
    })

  const removeUnit = useMutation({
    mutationFn: () => adminCoursesAPI.removeUnit(courseId, unit.id),
    onSuccess: invalidate,
    onError,
  })
  const addLesson = useMutation({
    mutationFn: (title: string) => adminCoursesAPI.createLesson(courseId, unit.id, { title }),
    onSuccess: () => {
      setNewLesson('')
      invalidate()
    },
    onError,
  })
  const removeLesson = useMutation({
    mutationFn: (lessonId: string) => adminCoursesAPI.removeLesson(lessonId),
    onSuccess: invalidate,
    onError,
  })
  const reorderLessons = useMutation({
    mutationFn: (order: string[]) => adminCoursesAPI.reorderLessons(courseId, unit.id, order),
    onSuccess: invalidate,
    onError,
  })

  const moveLesson = (i: number, dir: -1 | 1) => {
    const ids = unit.lessons.map((l) => l.id)
    const j = i + dir
    if (j < 0 || j >= ids.length) return
    ;[ids[i], ids[j]] = [ids[j], ids[i]]
    reorderLessons.mutate(ids)
  }

  return (
    <Card>
      <CardContent className="space-y-3 p-5">
        <div className="flex items-center justify-between gap-2">
          <span className="font-semibold">
            {t('admin.courses.unitN', { n: unit.position })} · {unit.title}
          </span>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              aria-label={t('admin.courses.moveUp')}
              disabled={index === 0}
              onClick={() => onMove(index, -1)}
            >
              <ArrowUp className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              aria-label={t('admin.courses.moveDown')}
              disabled={index === count - 1}
              onClick={() => onMove(index, 1)}
            >
              <ArrowDown className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              aria-label={t('admin.courses.removeUnit')}
              loading={removeUnit.isPending}
              onClick={() => removeUnit.mutate()}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {unit.lessons.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('admin.courses.unitEmpty')}</p>
        ) : (
          <ol className="space-y-1.5">
            {unit.lessons.map((lesson, i) => (
              <li
                key={lesson.id}
                className="flex items-center gap-2 rounded-md border border-border p-2"
              >
                <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                <button
                  type="button"
                  className="line-clamp-1 flex-1 text-left text-sm hover:underline"
                  onClick={() => onEditLesson(lesson.id)}
                >
                  {lesson.title}
                </button>
                {lesson.linkedExam && <Badge variant="outline">{t('admin.courses.exam')}</Badge>}
                {!lesson.hasContent && (
                  <Badge variant="secondary">{t('admin.courses.emptyBadge')}</Badge>
                )}
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={t('admin.courses.moveUp')}
                  disabled={i === 0 || reorderLessons.isPending}
                  onClick={() => moveLesson(i, -1)}
                >
                  <ArrowUp className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={t('admin.courses.moveDown')}
                  disabled={i === unit.lessons.length - 1 || reorderLessons.isPending}
                  onClick={() => moveLesson(i, 1)}
                >
                  <ArrowDown className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={t('admin.courses.editLesson')}
                  onClick={() => onEditLesson(lesson.id)}
                >
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={t('admin.courses.removeLesson')}
                  onClick={() => removeLesson.mutate(lesson.id)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </li>
            ))}
          </ol>
        )}

        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            if (newLesson.trim()) addLesson.mutate(newLesson.trim())
          }}
        >
          <Input
            value={newLesson}
            onChange={(e) => setNewLesson(e.target.value)}
            placeholder={t('admin.courses.newLessonPlaceholder')}
          />
          <Button type="submit" variant="outline" loading={addLesson.isPending} disabled={!newLesson.trim()}>
            <Plus className="h-4 w-4" /> {t('admin.courses.addLesson')}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}

export function CourseBuilder({ courseId }: { courseId: string }) {
  const { t } = useI18n()
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const [editOpen, setEditOpen] = React.useState(false)
  const [newUnit, setNewUnit] = React.useState('')
  const [editingLesson, setEditingLesson] = React.useState<string | null>(null)

  const course = useQuery({
    queryKey: ['admin', 'course', courseId],
    queryFn: () => adminCoursesAPI.get(courseId),
  })

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['admin', 'course', courseId] })
  const onError = (err: unknown) =>
    toast({
      variant: 'error',
      title: t('admin.courses.actionFailed'),
      description: parseApiError(err).message,
    })

  const addUnit = useMutation({
    mutationFn: (title: string) => adminCoursesAPI.createUnit(courseId, title),
    onSuccess: () => {
      setNewUnit('')
      invalidate()
    },
    onError,
  })
  const reorderUnits = useMutation({
    mutationFn: (order: string[]) => adminCoursesAPI.reorderUnits(courseId, order),
    onSuccess: invalidate,
    onError,
  })
  const publish = useMutation({
    mutationFn: (action: CoursePublishAction) => adminCoursesAPI.publish(courseId, action),
    onSuccess: () => {
      invalidate()
      queryClient.invalidateQueries({ queryKey: ['admin', 'courses'] })
      toast({ variant: 'success', title: t('admin.courses.updated') })
    },
    onError,
  })

  if (course.isLoading) return <FullPageSpinner label={t('common.loading')} />
  if (course.isError || !course.data)
    return <p className="text-sm text-muted-foreground">{t('admin.courses.loadFailed')}</p>

  const c = course.data
  const moveUnit = (index: number, dir: -1 | 1) => {
    const ids = c.units.map((u) => u.id)
    const j = index + dir
    if (j < 0 || j >= ids.length) return
    ;[ids[index], ids[j]] = [ids[j], ids[index]]
    reorderUnits.mutate(ids)
  }

  return (
    <div className="space-y-6">
      <Link
        href="/admin/courses"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> {t('admin.courses.backToCourses')}
      </Link>

      <div>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-bold tracking-tight">{c.title}</h1>
          <Badge variant={STATUS_VARIANT[c.status]}>{t(`admin.courses.statusLabel.${c.status}`)}</Badge>
          <Badge variant="secondary">{t(`admin.courses.subjectLabel.${c.subject}`)}</Badge>
          <Button variant="ghost" size="sm" onClick={() => setEditOpen(true)}>
            <Pencil className="h-4 w-4" /> {t('admin.courses.editDetails')}
          </Button>
          {c.status !== 'published' ? (
            <Button size="sm" loading={publish.isPending} onClick={() => publish.mutate('publish')}>
              {t('admin.courses.publish')}
            </Button>
          ) : (
            <Button
              size="sm"
              variant="outline"
              loading={publish.isPending}
              onClick={() => publish.mutate('archive')}
            >
              {t('admin.courses.archive')}
            </Button>
          )}
        </div>
        {c.description && <p className="mt-1 text-muted-foreground">{c.description}</p>}
      </div>

      <div className="space-y-4">
        {c.units.map((u, i) => (
          <UnitCard
            key={u.id}
            courseId={courseId}
            unit={u}
            index={i}
            count={c.units.length}
            onMove={moveUnit}
            onEditLesson={setEditingLesson}
          />
        ))}
        {c.units.length === 0 && (
          <Card>
            <CardContent className="p-8 text-center text-sm text-muted-foreground">
              {t('admin.courses.noUnits')}
            </CardContent>
          </Card>
        )}
      </div>

      <form
        className="flex max-w-md gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          if (newUnit.trim()) addUnit.mutate(newUnit.trim())
        }}
      >
        <Input
          value={newUnit}
          onChange={(e) => setNewUnit(e.target.value)}
          placeholder={t('admin.courses.newUnitPlaceholder')}
        />
        <Button type="submit" variant="outline" loading={addUnit.isPending} disabled={!newUnit.trim()}>
          <Plus className="h-4 w-4" /> {t('admin.courses.addUnit')}
        </Button>
      </form>

      <EditCourseDialog course={c} open={editOpen} onOpenChange={setEditOpen} />
      <LessonEditor
        courseId={courseId}
        lessonId={editingLesson}
        open={editingLesson !== null}
        onOpenChange={(o) => {
          if (!o) setEditingLesson(null)
        }}
      />
    </div>
  )
}
