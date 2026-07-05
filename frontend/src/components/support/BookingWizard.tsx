// Domain: Support
// Description: Book a Teacher wizard — subject → teacher → slot → details/confirm.
//   Teachers come from published availability (no directory); slots from the
//   server (generate_slots). On success, redirects to My Sessions.
'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { useMutation, useQuery } from '@tanstack/react-query'
import { format } from 'date-fns'
import { uz as uzDate } from 'date-fns/locale'
import { ArrowLeft, ArrowRight, Calendar, Check, User } from 'lucide-react'
import { supportAPI } from '@/lib/api/support'
import { parseApiError } from '@/lib/api/errors'
import { useI18n } from '@/lib/i18n/I18nProvider'
import { useToast } from '@/components/ui/toast'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils/cn'
import type { BookableTeacher, SupportSlot, SupportSubject } from '@/types'

const SUBJECTS: SupportSubject[] = ['math', 'reading_writing']
type Step = 'subject' | 'teacher' | 'slot' | 'details'

export function BookingWizard() {
  const { t, locale } = useI18n()
  const { toast } = useToast()
  const router = useRouter()
  const dfLocale = locale === 'uz' ? uzDate : undefined

  const [step, setStep] = React.useState<Step>('subject')
  const [subject, setSubject] = React.useState<SupportSubject | null>(null)
  const [teacher, setTeacher] = React.useState<BookableTeacher | null>(null)
  const [slot, setSlot] = React.useState<SupportSlot | null>(null)
  const [topic, setTopic] = React.useState('')
  const [reason, setReason] = React.useState('')

  const teachersQuery = useQuery({
    queryKey: ['support', 'bookable-teachers', subject],
    queryFn: () => supportAPI.bookableTeachers(subject ?? undefined),
    enabled: step === 'teacher' && !!subject,
  })

  const slotsQuery = useQuery({
    queryKey: ['support', 'slots', teacher?.teacher.id, subject],
    queryFn: () =>
      supportAPI.slots({ teacher: teacher!.teacher.id, subject: subject!, days: 14 }),
    enabled: step === 'slot' && !!teacher && !!subject,
  })

  const book = useMutation({
    mutationFn: () =>
      supportAPI.bookings.create({
        teacher: teacher!.teacher.id,
        subject: subject!,
        scheduledAt: slot!.scheduledAt,
        topic: topic.trim(),
        reason: reason.trim(),
      }),
    onSuccess: () => {
      toast({ variant: 'success', title: t('support.book.booked') })
      router.push('/support/sessions')
    },
    onError: (err) =>
      toast({
        variant: 'error',
        title: t('support.book.bookFailed'),
        description: parseApiError(err).message,
      }),
  })

  function pickSubject(s: SupportSubject) {
    setSubject(s)
    setTeacher(null)
    setSlot(null)
    setStep('teacher')
  }
  function pickTeacher(bt: BookableTeacher) {
    setTeacher(bt)
    setSlot(null)
    setStep('slot')
  }
  function pickSlot(s: SupportSlot) {
    setSlot(s)
    setStep('details')
  }

  const stepIndex = ['subject', 'teacher', 'slot', 'details'].indexOf(step)

  return (
    <div className="space-y-4">
      {/* Stepper */}
      <ol className="flex items-center gap-2 text-xs text-muted-foreground">
        {(['subject', 'teacher', 'slot', 'details'] as Step[]).map((s, i) => (
          <li key={s} className="flex items-center gap-2">
            <span
              className={cn(
                'flex h-6 w-6 items-center justify-center rounded-full border text-[11px] font-medium',
                i <= stepIndex
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-border'
              )}
            >
              {i + 1}
            </span>
            <span className={cn(i === stepIndex && 'font-medium text-foreground')}>
              {t(`support.book.step.${s}`)}
            </span>
            {i < 3 && <span className="text-border">—</span>}
          </li>
        ))}
      </ol>

      <Card>
        <CardContent className="space-y-4 p-6">
          {step === 'subject' && (
            <div className="space-y-3">
              <h2 className="font-semibold">{t('support.book.chooseSubject')}</h2>
              <div className="grid gap-3 sm:grid-cols-2">
                {SUBJECTS.map((s) => (
                  <button
                    key={s}
                    onClick={() => pickSubject(s)}
                    className="rounded-lg border border-border p-4 text-left transition-colors hover:border-primary hover:bg-muted"
                  >
                    <span className="font-medium">{t(`support.subject.${s}`)}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {step === 'teacher' && (
            <div className="space-y-3">
              <h2 className="font-semibold">{t('support.book.chooseTeacher')}</h2>
              {teachersQuery.isLoading && <StepSkeleton />}
              {teachersQuery.isError && (
                <p className="text-sm text-muted-foreground">{t('support.book.loadFailed')}</p>
              )}
              {teachersQuery.data && teachersQuery.data.length === 0 && (
                <p className="text-sm text-muted-foreground">{t('support.book.noTeachers')}</p>
              )}
              <div className="grid gap-3 sm:grid-cols-2">
                {teachersQuery.data?.map((bt) => (
                  <button
                    key={bt.teacher.id}
                    onClick={() => pickTeacher(bt)}
                    className="flex items-center gap-3 rounded-lg border border-border p-4 text-left transition-colors hover:border-primary hover:bg-muted"
                  >
                    <span className="flex h-9 w-9 items-center justify-center rounded-full bg-muted">
                      <User className="h-5 w-5 text-muted-foreground" />
                    </span>
                    <span className="font-medium">{bt.teacher.fullName}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {step === 'slot' && (
            <div className="space-y-3">
              <h2 className="font-semibold">{t('support.book.chooseSlot')}</h2>
              {slotsQuery.isLoading && <StepSkeleton />}
              {slotsQuery.isError && (
                <p className="text-sm text-muted-foreground">{t('support.book.loadFailed')}</p>
              )}
              {slotsQuery.data && slotsQuery.data.length === 0 && (
                <p className="text-sm text-muted-foreground">{t('support.book.noSlots')}</p>
              )}
              <div className="grid gap-2 sm:grid-cols-3">
                {slotsQuery.data?.map((s) => (
                  <button
                    key={s.scheduledAt}
                    onClick={() => pickSlot(s)}
                    className="rounded-md border border-border px-3 py-2 text-sm transition-colors hover:border-primary hover:bg-muted"
                  >
                    {format(new Date(s.scheduledAt), 'EEE, MMM d · HH:mm', { locale: dfLocale })}
                  </button>
                ))}
              </div>
            </div>
          )}

          {step === 'details' && slot && teacher && subject && (
            <form
              onSubmit={(e) => {
                e.preventDefault()
                book.mutate()
              }}
              className="space-y-4"
            >
              <h2 className="font-semibold">{t('support.book.confirmTitle')}</h2>
              <div className="space-y-1 rounded-md bg-muted p-3 text-sm">
                <div className="flex items-center gap-2">
                  <User className="h-4 w-4 text-muted-foreground" />
                  {teacher.teacher.fullName} · {t(`support.subject.${subject}`)}
                </div>
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                  {format(new Date(slot.scheduledAt), 'PPPP · HH:mm', { locale: dfLocale })}
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="topic">{t('support.book.topicLabel')}</Label>
                <Input
                  id="topic"
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                  placeholder={t('support.book.topicPlaceholder')}
                  maxLength={200}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="reason">{t('support.book.reasonLabel')}</Label>
                <Textarea
                  id="reason"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder={t('support.book.reasonPlaceholder')}
                  rows={3}
                />
              </div>
              <Button type="submit" loading={book.isPending} className="w-full">
                <Check className="h-4 w-4" /> {t('support.book.confirm')}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>

      {step !== 'subject' && (
        <Button
          variant="ghost"
          onClick={() => {
            const order: Step[] = ['subject', 'teacher', 'slot', 'details']
            setStep(order[Math.max(0, stepIndex - 1)])
          }}
        >
          <ArrowLeft className="h-4 w-4" /> {t('support.book.back')}
        </Button>
      )}
      {step === 'subject' && (
        <p className="flex items-center gap-1 text-xs text-muted-foreground">
          <ArrowRight className="h-3 w-3" /> {t('support.book.hint')}
        </p>
      )}
    </div>
  )
}

function StepSkeleton() {
  return (
    <div className="space-y-2">
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="h-10 animate-pulse rounded bg-muted" />
      ))}
    </div>
  )
}
