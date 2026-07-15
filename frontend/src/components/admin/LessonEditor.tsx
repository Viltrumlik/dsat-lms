// Domain: Admin (course builder)
// Description: Edit one lesson in a side sheet — title, markdown/KaTeX body with a
//   live preview (reuses MarkdownMath), a video URL, optional linked exam/homework,
//   and file attachments (upload via the files pipeline). Loads the full lesson on open.
'use client'

import * as React from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { FileText, Paperclip, Trash2, Upload } from 'lucide-react'
import { adminCoursesAPI, type LessonWritePayload } from '@/lib/api/admin/courses'
import { adminExamsAPI } from '@/lib/api/admin/exams'
import { filesAPI } from '@/lib/api/files'
import { homeworkAPI } from '@/lib/api/homework'
import { parseApiError } from '@/lib/api/errors'
import { useI18n } from '@/lib/i18n/I18nProvider'
import { useToast } from '@/components/ui/toast'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Textarea } from '@/components/ui/textarea'
import { MarkdownMath } from '@/components/test-engine/MarkdownMath'

const NONE = '__none__'

export function LessonEditor({
  courseId,
  lessonId,
  open,
  onOpenChange,
}: {
  courseId: string
  lessonId: string | null
  open: boolean
  onOpenChange: (o: boolean) => void
}) {
  const { t } = useI18n()
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const fileRef = React.useRef<HTMLInputElement>(null)

  const [title, setTitle] = React.useState('')
  const [contentMd, setContentMd] = React.useState('')
  const [videoUrl, setVideoUrl] = React.useState('')
  const [linkedExam, setLinkedExam] = React.useState<string>(NONE)
  const [linkedHomework, setLinkedHomework] = React.useState<string>(NONE)

  const lesson = useQuery({
    queryKey: ['admin', 'lesson', lessonId],
    queryFn: () => adminCoursesAPI.getLesson(lessonId as string),
    enabled: open && !!lessonId,
  })

  // Hydrate local form when the lesson loads.
  React.useEffect(() => {
    if (lesson.data) {
      setTitle(lesson.data.title)
      setContentMd(lesson.data.contentMd)
      setVideoUrl(lesson.data.videoUrl ?? '')
      setLinkedExam(lesson.data.linkedExam ?? NONE)
      setLinkedHomework(lesson.data.linkedHomework ?? NONE)
    }
  }, [lesson.data])

  const exams = useQuery({
    queryKey: ['admin', 'exam-picker'],
    queryFn: () => adminExamsAPI.list({}),
    enabled: open,
  })
  const homeworks = useQuery({
    queryKey: ['admin', 'homework-picker'],
    queryFn: () => homeworkAPI.list(),
    enabled: open,
  })

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['admin', 'course', courseId] })
    queryClient.invalidateQueries({ queryKey: ['admin', 'lesson', lessonId] })
  }
  const onError = (err: unknown) =>
    toast({
      variant: 'error',
      title: t('admin.courses.actionFailed'),
      description: parseApiError(err).message,
    })

  const save = useMutation({
    mutationFn: () => {
      const payload: Partial<LessonWritePayload> = {
        title: title.trim(),
        contentMd,
        videoUrl: videoUrl.trim() || null,
        linkedExam: linkedExam === NONE ? null : linkedExam,
        linkedHomework: linkedHomework === NONE ? null : linkedHomework,
      }
      return adminCoursesAPI.updateLesson(lessonId as string, payload)
    },
    onSuccess: () => {
      invalidate()
      toast({ variant: 'success', title: t('admin.courses.lessonSaved') })
    },
    onError,
  })

  const upload = useMutation({
    mutationFn: async (file: File) => {
      const att = await filesAPI.upload({ file, kind: 'document' })
      return adminCoursesAPI.addLessonAttachment(lessonId as string, att.id, file.name)
    },
    onSuccess: () => invalidate(),
    onError,
  })

  const removeAttachment = useMutation({
    mutationFn: (attId: string) => adminCoursesAPI.removeLessonAttachment(lessonId as string, attId),
    onSuccess: () => invalidate(),
    onError,
  })

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-2xl">
        <SheetHeader>
          <SheetTitle>{t('admin.courses.editLesson')}</SheetTitle>
        </SheetHeader>

        {lesson.isLoading && (
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-10 animate-pulse rounded bg-muted" />
            ))}
          </div>
        )}

        {lesson.isError && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border p-4 text-sm text-muted-foreground">
            {t('admin.courses.lessonLoadFailed')}
            <Button variant="outline" size="sm" onClick={() => lesson.refetch()}>
              {t('common.tryAgain')}
            </Button>
          </div>
        )}

        {lesson.data && (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="le-title">{t('admin.courses.lessonTitle')}</Label>
              <Input id="le-title" value={title} onChange={(e) => setTitle(e.target.value)} />
            </div>

            <div className="space-y-2">
              <Label htmlFor="le-body">{t('admin.courses.lessonBody')}</Label>
              <Textarea
                id="le-body"
                value={contentMd}
                onChange={(e) => setContentMd(e.target.value)}
                rows={8}
                placeholder={t('admin.courses.lessonBodyPlaceholder')}
                className="font-mono text-sm"
              />
            </div>

            {contentMd.trim() && (
              <div className="space-y-1.5">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {t('admin.courses.preview')}
                </p>
                <div className="rounded-lg border border-border bg-background p-4">
                  <MarkdownMath content={contentMd} />
                </div>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="le-video">{t('admin.courses.videoUrl')}</Label>
              <Input
                id="le-video"
                value={videoUrl}
                onChange={(e) => setVideoUrl(e.target.value)}
                placeholder="https://…"
              />
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="le-exam">{t('admin.courses.linkedExam')}</Label>
                <Select value={linkedExam} onValueChange={setLinkedExam}>
                  <SelectTrigger id="le-exam">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>{t('admin.courses.none')}</SelectItem>
                    {(exams.data?.data ?? []).map((ex) => (
                      <SelectItem key={ex.id} value={ex.id}>
                        {ex.title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="le-hw">{t('admin.courses.linkedHomework')}</Label>
                <Select value={linkedHomework} onValueChange={setLinkedHomework}>
                  <SelectTrigger id="le-hw">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>{t('admin.courses.none')}</SelectItem>
                    {(homeworks.data ?? []).map((hw) => (
                      <SelectItem key={hw.id} value={hw.id}>
                        {hw.title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Attachments */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="flex items-center gap-1.5">
                  <Paperclip className="h-4 w-4" /> {t('admin.courses.attachments')}
                </Label>
                <Button
                  variant="outline"
                  size="sm"
                  loading={upload.isPending}
                  onClick={() => fileRef.current?.click()}
                >
                  <Upload className="h-4 w-4" /> {t('admin.courses.upload')}
                </Button>
                <input
                  ref={fileRef}
                  type="file"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0]
                    if (file) upload.mutate(file)
                    e.target.value = ''
                  }}
                />
              </div>
              {lesson.data.attachments.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t('admin.courses.noAttachments')}</p>
              ) : (
                <ul className="space-y-1.5">
                  {lesson.data.attachments.map((a) => (
                    <li
                      key={a.id}
                      className="flex items-center gap-2 rounded-md border border-border p-2 text-sm"
                    >
                      <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <span className="line-clamp-1 flex-1">{a.originalName}</span>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={t('admin.courses.removeAttachment')}
                        onClick={() => removeAttachment.mutate(a.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                {t('admin.common.cancel')}
              </Button>
              <Button loading={save.isPending} disabled={!title.trim()} onClick={() => save.mutate()}>
                {t('admin.courses.saveLesson')}
              </Button>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  )
}
