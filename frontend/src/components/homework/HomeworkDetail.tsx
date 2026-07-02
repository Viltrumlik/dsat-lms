// Domain: Homework
// Description: Homework detail — instructions, due date, and the student
//   actions: start the linked test (exam-backed) and/or submit the homework
//   (confirm dialog). Submitted/graded homework shows a read-only status panel.
'use client'

import * as React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AxiosError } from 'axios'
import { format, formatDistanceToNow } from 'date-fns'
import { uz as uzDate } from 'date-fns/locale'
import { ArrowLeft, CalendarClock, CheckCircle2, GraduationCap, Play, Users } from 'lucide-react'
import { homeworkAPI } from '@/lib/api/homework'
import { useSessionStore } from '@/lib/stores/sessionStore'
import { useI18n } from '@/lib/i18n/I18nProvider'
import { parseApiError } from '@/lib/api/errors'
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
import { HomeworkStatusBadge, homeworkStatusOf } from './HomeworkStatusBadge'
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
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const { t, locale } = useI18n()
  const resetSession = useSessionStore((s) => s.resetSession)
  const [confirmOpen, setConfirmOpen] = React.useState(false)

  const status = homeworkStatusOf(homework)

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

  const submit = useMutation({
    mutationFn: () => homeworkAPI.submit(homework.id),
    onSuccess: () => {
      setConfirmOpen(false)
      queryClient.invalidateQueries({ queryKey: ['homework'] })
      toast({
        variant: 'success',
        title: t('homework.submitSuccessTitle'),
        description: t('homework.submitSuccessDesc'),
      })
    },
    onError: (err) => {
      toast({
        variant: 'error',
        title: t('homework.submitFailed'),
        description: parseApiError(err).message,
      })
    },
  })

  if (status !== 'assigned') {
    const submittedAt = homework.mySubmission?.submittedAt
    return (
      <Card>
        <CardContent className="flex items-center gap-3 p-5">
          {status === 'graded' ? (
            <GraduationCap className="h-5 w-5 shrink-0 text-primary" />
          ) : (
            <CheckCircle2 className="h-5 w-5 shrink-0 text-success" />
          )}
          <p className="text-sm">
            {status === 'graded'
              ? t('homework.gradedNote')
              : t('homework.submittedAt', {
                  time: submittedAt
                    ? formatDistanceToNow(new Date(submittedAt), {
                        addSuffix: true,
                        locale: dateLocale(locale),
                      })
                    : '',
                })}
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardContent className="space-y-4 p-5">
        {homework.exam && (
          <p className="text-sm text-muted-foreground">{t('homework.testHint')}</p>
        )}
        <div className="flex flex-col gap-3 sm:flex-row">
          {homework.exam && (
            <Button loading={startTest.isPending} onClick={() => startTest.mutate()}>
              <Play className="h-4 w-4" /> {t('homework.startTest')}
            </Button>
          )}
          <Button
            variant={homework.exam ? 'outline' : 'default'}
            onClick={() => setConfirmOpen(true)}
          >
            {t('homework.submit')}
          </Button>
        </div>
      </CardContent>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('homework.confirm.title')}</DialogTitle>
            <DialogDescription>{t('homework.confirm.desc')}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>
              {t('homework.confirm.cancel')}
            </Button>
            <Button loading={submit.isPending} onClick={() => submit.mutate()}>
              {t('homework.submit')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
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

      {data.exam && data.examTitle && (
        <p className="text-sm text-muted-foreground">
          {t('homework.linkedTest')}: <span className="font-medium text-foreground">{data.examTitle}</span>
        </p>
      )}

      <Actions homework={data} />
    </div>
  )
}
