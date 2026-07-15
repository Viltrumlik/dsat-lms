// Domain: Courses (student)
// Description: The lesson player — a unit/lesson navigator on the left, the selected
//   lesson's markdown/KaTeX content on the right, with video, linked exam/homework
//   launch, attachments, and a mark-complete control. Progress persists per lesson.
'use client'

import * as React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, CheckCircle2, Circle, FileText, PlayCircle } from 'lucide-react'
import { coursesAPI } from '@/lib/api/courses'
import { sessionAPI } from '@/lib/api/sessions'
import { filesAPI } from '@/lib/api/files'
import { parseApiError } from '@/lib/api/errors'
import { cn } from '@/lib/utils/cn'
import { useI18n } from '@/lib/i18n/I18nProvider'
import { useToast } from '@/components/ui/toast'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { FullPageSpinner } from '@/components/ui/spinner'
import { MarkdownMath } from '@/components/test-engine/MarkdownMath'
import type { StudentLesson } from '@/types'

export function CoursePlayer({ courseId }: { courseId: string }) {
  const { t } = useI18n()
  const { toast } = useToast()
  const router = useRouter()
  const queryClient = useQueryClient()
  const [activeId, setActiveId] = React.useState<string | null>(null)

  const course = useQuery({
    queryKey: ['course', courseId],
    queryFn: () => coursesAPI.get(courseId),
  })

  const lessons = React.useMemo(
    () => course.data?.units.flatMap((u) => u.lessons) ?? [],
    [course.data]
  )
  const active: StudentLesson | undefined =
    lessons.find((l) => l.id === activeId) ?? lessons[0]

  const markComplete = useMutation({
    mutationFn: (lessonId: string) => coursesAPI.markProgress(lessonId, 'completed'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['course', courseId] })
      queryClient.invalidateQueries({ queryKey: ['courses'] })
      toast({ variant: 'success', title: t('courses.markedComplete') })
    },
    onError: (err) =>
      toast({
        variant: 'error',
        title: t('courses.actionFailed'),
        description: parseApiError(err).message,
      }),
  })

  const startExam = useMutation({
    mutationFn: (examId: string) => sessionAPI.start(examId),
    onSuccess: (session) => router.push(`/session/${session.id}`),
    onError: (err) =>
      toast({
        variant: 'error',
        title: t('courses.actionFailed'),
        description: parseApiError(err).message,
      }),
  })

  if (course.isLoading) return <FullPageSpinner label={t('common.loading')} />
  if (course.isError || !course.data)
    return <p className="text-sm text-muted-foreground">{t('courses.loadFailed')}</p>

  const c = course.data

  return (
    <div className="space-y-6">
      <Link
        href="/courses"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> {t('courses.backToCourses')}
      </Link>

      <h1 className="text-2xl font-bold tracking-tight">{c.title}</h1>

      <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
        {/* Navigator */}
        <nav className="space-y-4">
          {c.units.map((unit) => (
            <div key={unit.id}>
              <p className="px-1 pb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {unit.title}
              </p>
              <ul className="space-y-0.5">
                {unit.lessons.map((lesson) => {
                  const done = lesson.progressStatus === 'completed'
                  const isActive = active?.id === lesson.id
                  return (
                    <li key={lesson.id}>
                      <button
                        type="button"
                        onClick={() => setActiveId(lesson.id)}
                        className={cn(
                          'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors',
                          isActive ? 'bg-muted font-medium' : 'hover:bg-muted/60'
                        )}
                      >
                        {done ? (
                          <CheckCircle2 className="h-4 w-4 shrink-0 text-success" />
                        ) : (
                          <Circle className="h-4 w-4 shrink-0 text-muted-foreground" />
                        )}
                        <span className="line-clamp-1">{lesson.title}</span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            </div>
          ))}
        </nav>

        {/* Lesson content */}
        <div>
          {!active ? (
            <Card>
              <CardContent className="p-10 text-center text-sm text-muted-foreground">
                {t('courses.noLessons')}
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="space-y-5 p-6">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h2 className="text-xl font-semibold">{active.title}</h2>
                  {active.progressStatus === 'completed' ? (
                    <span className="inline-flex items-center gap-1.5 text-sm text-success">
                      <CheckCircle2 className="h-4 w-4" /> {t('courses.completed')}
                    </span>
                  ) : (
                    <Button
                      size="sm"
                      loading={markComplete.isPending}
                      onClick={() => markComplete.mutate(active.id)}
                    >
                      <CheckCircle2 className="h-4 w-4" /> {t('courses.markComplete')}
                    </Button>
                  )}
                </div>

                {active.videoUrl && (
                  <a
                    href={active.videoUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
                  >
                    <PlayCircle className="h-4 w-4" /> {t('courses.watchVideo')}
                  </a>
                )}

                {active.contentMd && (
                  <div className="prose-sm max-w-none">
                    <MarkdownMath content={active.contentMd} />
                  </div>
                )}

                {(active.linkedExam || active.linkedHomework) && (
                  <div className="flex flex-wrap gap-2 border-t border-border pt-4">
                    {active.linkedExam && (
                      <Button
                        variant="outline"
                        loading={startExam.isPending}
                        onClick={() => startExam.mutate(active.linkedExam!.id)}
                      >
                        <PlayCircle className="h-4 w-4" /> {t('courses.startExam')}
                      </Button>
                    )}
                    {active.linkedHomework && (
                      <Button
                        variant="outline"
                        onClick={() => router.push(`/homework/${active.linkedHomework!.id}`)}
                      >
                        {t('courses.openHomework')}
                      </Button>
                    )}
                  </div>
                )}

                {active.attachments.length > 0 && (
                  <div className="space-y-1.5 border-t border-border pt-4">
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      {t('courses.attachments')}
                    </p>
                    <ul className="space-y-1.5">
                      {active.attachments.map((a) => (
                        <li key={a.id}>
                          <button
                            type="button"
                            onClick={() => filesAPI.download(a.downloadUrl, a.originalName)}
                            className="inline-flex items-center gap-2 text-sm text-primary hover:underline"
                          >
                            <FileText className="h-4 w-4" /> {a.originalName}
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}
