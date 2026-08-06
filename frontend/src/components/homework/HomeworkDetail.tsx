// Domain: Homework
// Description: Homework detail — the brief (instructions, due date, the
//   teacher's materials), then either the hand-in form or, once work has gone
//   in, the submission panel (what was handed over, the mark, the teacher's
//   words, the trail). A RETURNED piece shows both: the note explaining the
//   hand-back, and the form to have another go.
'use client'

import * as React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useMutation, useQuery } from '@tanstack/react-query'
import { AxiosError } from 'axios'
import { format } from 'date-fns'
import { uz as uzDate } from 'date-fns/locale'
import { ArrowLeft, CalendarClock, Play, Users } from 'lucide-react'
import { homeworkAPI } from '@/lib/api/homework'
import { useSessionStore } from '@/lib/stores/sessionStore'
import { useI18n } from '@/lib/i18n/I18nProvider'
import { parseApiError } from '@/lib/api/errors'
import { useToast } from '@/components/ui/toast'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { HomeworkStatusBadge, homeworkStatusOf } from './HomeworkStatusBadge'
import { FileList } from './FileList'
import { SubmissionForm } from './SubmissionForm'
import { SubmissionPanel } from './SubmissionPanel'
import type { Locale } from '@/lib/i18n/config'
import type { Homework } from '@/types'

function httpStatusOf(err: unknown): number | undefined {
  return err instanceof AxiosError ? err.response?.status : undefined
}

function dateLocale(locale: Locale) {
  return locale === 'uz' ? uzDate : undefined
}

function Actions({ homework }: { homework: Homework }) {
  const router = useRouter()
  const { toast } = useToast()
  const t = useI18n().t
  const resetSession = useSessionStore((s) => s.resetSession)

  const status = homeworkStatusOf(homework)
  // Handing in and handing in AGAIN are the same action; a returned piece is
  // simply open for work with a note attached to it.
  const canWork = status === 'assigned' || status === 'returned'

  const startTest = useMutation({
    // Homework-aware start: binds the session to the submission so submitting
    // the test turns the homework in automatically.
    mutationFn: () => homeworkAPI.start(homework.id),
    onSuccess: (session) => {
      resetSession()
      router.push(`/session/${session.id}`)
    },
    onError: (err) => {
      toast({
        variant: 'error',
        title: t('homework.startFailed'),
        description: parseApiError(err).message,
      })
    },
  })

  if (!canWork) return null

  return (
    <Card>
      <CardContent className="space-y-4 p-5">
        {homework.exam && (
          <>
            <p className="text-sm text-muted-foreground">{t('homework.testHint')}</p>
            <Button loading={startTest.isPending} onClick={() => startTest.mutate()}>
              <Play className="h-4 w-4" /> {t('homework.startTest')}
            </Button>
            <div className="h-px bg-border" />
          </>
        )}
        <SubmissionForm homework={homework} />
      </CardContent>
    </Card>
  )
}

export function HomeworkDetail({ id }: { id: string }) {
  const { t, locale } = useI18n()
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['homework', id],
    queryFn: () => homeworkAPI.get(id),
    retry: (failureCount, err) => {
      const status = httpStatusOf(err)
      if (status && status >= 400 && status < 500) return false
      return failureCount < 2
    },
  })

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="h-5 w-40 animate-pulse rounded bg-muted" />
        <div className="h-8 w-2/3 animate-pulse rounded bg-muted" />
        <div className="h-40 animate-pulse rounded-xl bg-muted" />
      </div>
    )
  }

  if (isError || !data) {
    const status = httpStatusOf(error)
    const message =
      status === 404
        ? t('homework.notFound')
        : status === 403
          ? t('homework.academyOnly')
          : t('homework.loadFailed')
    return (
      <div className="space-y-6">
        <Link
          href="/homework"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> {t('homework.backToList')}
        </Link>
        <Card>
          <CardContent className="p-10 text-center text-sm text-muted-foreground">
            {message}
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <Link
        href="/homework"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> {t('homework.backToList')}
      </Link>

      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-bold tracking-tight">{data.title}</h1>
          <HomeworkStatusBadge homework={data} />
        </div>
        <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <Users className="h-4 w-4" /> {data.className}
          </span>
          <span className="flex items-center gap-1.5">
            <CalendarClock className="h-4 w-4" />{' '}
            {t('homework.dueAt', {
              date: format(new Date(data.dueAt), 'PPp', { locale: dateLocale(locale) }),
            })}
          </span>
        </div>
      </div>

      {data.description && (
        <div className="space-y-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            {t('homework.instructions')}
          </h2>
          <Card>
            <CardContent className="whitespace-pre-wrap p-5 text-sm leading-relaxed">
              {data.description}
            </CardContent>
          </Card>
        </div>
      )}

      {data.attachments.length > 0 && (
        <FileList files={data.attachments} label={t('homework.materials')} />
      )}

      {data.exam && data.examTitle && (
        <p className="text-sm text-muted-foreground">
          {t('homework.linkedTest')}: <span className="font-medium text-foreground">{data.examTitle}</span>
        </p>
      )}

      {data.mySubmission && data.mySubmission.status !== 'assigned' && (
        <SubmissionPanel submission={data.mySubmission} />
      )}

      <Actions homework={data} />
    </div>
  )
}
