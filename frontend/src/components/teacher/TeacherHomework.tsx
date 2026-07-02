// Domain: Homework (teacher)
// Description: Teacher homework — table of assignments across own classes and
//   an assign dialog (class select, optional exam select, due datetime,
//   instructions textarea). Rows link to the submissions view.
'use client'

import * as React from 'react'
import Link from 'next/link'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { format } from 'date-fns'
import { uz as uzDate } from 'date-fns/locale'
import { ClipboardList, FileText, Plus } from 'lucide-react'
import { homeworkAPI } from '@/lib/api/homework'
import { teacherAPI } from '@/lib/api/teacher'
import { examAPI } from '@/lib/api/exams'
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
import { FieldError } from '@/components/ui/field-error'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
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
import { Textarea } from '@/components/ui/textarea'
import type { Locale } from '@/lib/i18n/config'

const NO_EXAM = 'none'

function formatDate(iso: string, locale: Locale, pattern = 'PPp') {
  try {
    return format(new Date(iso), pattern, { locale: locale === 'uz' ? uzDate : undefined })
  } catch {
    return iso
  }
}

function AssignDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { t } = useI18n()
  const { toast } = useToast()
  const queryClient = useQueryClient()

  const [title, setTitle] = React.useState('')
  const [description, setDescription] = React.useState('')
  const [classId, setClassId] = React.useState<string>('')
  const [examId, setExamId] = React.useState<string>(NO_EXAM)
  const [dueAt, setDueAt] = React.useState('')
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string>>({})

  const classesQuery = useQuery({
    queryKey: ['teacher', 'classes'],
    queryFn: teacherAPI.classes,
    enabled: open,
  })
  const examsQuery = useQuery({
    queryKey: ['exams'],
    queryFn: () => examAPI.list(),
    enabled: open,
  })

  const reset = () => {
    setTitle('')
    setDescription('')
    setClassId('')
    setExamId(NO_EXAM)
    setDueAt('')
    setFieldErrors({})
  }

  const create = useMutation({
    mutationFn: () =>
      teacherAPI.createHomework({
        title: title.trim(),
        description: description.trim() || undefined,
        assignedClass: classId,
        exam: examId === NO_EXAM ? undefined : examId,
        dueAt: new Date(dueAt).toISOString(),
      }),
    onSuccess: (homework) => {
      onOpenChange(false)
      reset()
      queryClient.invalidateQueries({ queryKey: ['homework'] })
      toast({
        variant: 'success',
        title: t('teacher.homework.assignedTitle'),
        description: homework.title,
      })
    },
    onError: (err) => {
      const parsed = parseApiError(err)
      setFieldErrors(parsed.fields)
      toast({
        variant: 'error',
        title: t('teacher.homework.assignFailed'),
        description: parsed.message,
      })
    },
  })

  const canSubmit = title.trim() !== '' && classId !== '' && dueAt !== ''

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (canSubmit) create.mutate()
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{t('teacher.homework.assignTitle')}</DialogTitle>
          <DialogDescription>{t('teacher.homework.assignDesc')}</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="hw-title">{t('teacher.homework.titleLabel')}</Label>
            <Input
              id="hw-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t('teacher.homework.titlePlaceholder')}
              aria-invalid={fieldErrors.title ? true : undefined}
            />
            <FieldError message={fieldErrors.title} />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>{t('teacher.homework.classLabel')}</Label>
              <Select value={classId || undefined} onValueChange={setClassId}>
                <SelectTrigger aria-invalid={fieldErrors.assignedClass ? true : undefined}>
                  <SelectValue placeholder={t('teacher.homework.classPlaceholder')} />
                </SelectTrigger>
                <SelectContent>
                  {(classesQuery.data ?? []).map((klass) => (
                    <SelectItem key={klass.id} value={klass.id}>
                      {klass.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FieldError message={fieldErrors.assignedClass} />
            </div>

            <div className="space-y-2">
              <Label htmlFor="hw-due">{t('teacher.homework.dueLabel')}</Label>
              <Input
                id="hw-due"
                type="datetime-local"
                value={dueAt}
                onChange={(e) => setDueAt(e.target.value)}
                aria-invalid={fieldErrors.dueAt ? true : undefined}
              />
              <FieldError message={fieldErrors.dueAt} />
            </div>
          </div>

          <div className="space-y-2">
            <Label>{t('teacher.homework.examLabel')}</Label>
            <Select value={examId} onValueChange={setExamId}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_EXAM}>{t('teacher.homework.noExam')}</SelectItem>
                {(examsQuery.data ?? []).map((exam) => (
                  <SelectItem key={exam.id} value={exam.id}>
                    {exam.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">{t('teacher.homework.examHint')}</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="hw-desc">{t('teacher.homework.descLabel')}</Label>
            <Textarea
              id="hw-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t('teacher.homework.descPlaceholder')}
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {t('teacher.common.cancel')}
            </Button>
            <Button type="submit" loading={create.isPending} disabled={!canSubmit}>
              {t('teacher.homework.assign')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export function TeacherHomework() {
  const { t, locale } = useI18n()
  const [assignOpen, setAssignOpen] = React.useState(false)

  const { data, isLoading, isError } = useQuery({
    queryKey: ['homework'],
    queryFn: homeworkAPI.list,
  })

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={() => setAssignOpen(true)}>
          <Plus className="h-4 w-4" /> {t('teacher.homework.assign')}
        </Button>
      </div>

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
            {t('teacher.homework.loadFailed')}
          </CardContent>
        </Card>
      )}

      {data && data.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 p-10 text-center">
            <ClipboardList className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">{t('teacher.homework.empty')}</p>
          </CardContent>
        </Card>
      )}

      {data && data.length > 0 && (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('teacher.homework.titleCol')}</TableHead>
                <TableHead>{t('teacher.homework.classCol')}</TableHead>
                <TableHead>{t('teacher.homework.dueCol')}</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((homework) => (
                <TableRow key={homework.id}>
                  <TableCell className="font-medium">
                    <Link href={`/teacher/homework/${homework.id}`} className="hover:underline">
                      {homework.title}
                    </Link>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{homework.className}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {formatDate(homework.dueAt, locale)}
                  </TableCell>
                  <TableCell className="text-right">
                    {homework.exam && (
                      <Badge variant="outline">
                        <FileText className="mr-1 h-3 w-3" /> {t('homework.testBadge')}
                      </Badge>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      <AssignDialog open={assignOpen} onOpenChange={setAssignOpen} />
    </div>
  )
}
