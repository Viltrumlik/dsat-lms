// Domain: Academy (mentor)
// Description: A mentor's per-mentee drilldown — header (student + lifecycle
//   status), the check-in log with an add form, and the parent-contact log with
//   an add form (guardian dropdown from the mentee header). Mentor-scoped
//   server-side: a mentor opens a mentee even if they're not in their class.
'use client'

import * as React from 'react'
import Link from 'next/link'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { format } from 'date-fns'
import { uz as uzDate } from 'date-fns/locale'
import { ArrowLeft, MessageSquarePlus, NotebookPen, Phone } from 'lucide-react'
import { mentorAPI } from '@/lib/api/mentor'
import { parseApiError } from '@/lib/api/errors'
import { useI18n } from '@/lib/i18n/I18nProvider'
import { useToast } from '@/components/ui/toast'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { FieldError } from '@/components/ui/field-error'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import type { ContactMethod, LifecycleStatus } from '@/types'

const STATUS_VARIANT: Record<LifecycleStatus, 'success' | 'warning' | 'secondary' | 'error'> = {
  active: 'success',
  frozen: 'warning',
  graduated: 'secondary',
  dropped: 'error',
}

const CONTACT_METHODS: ContactMethod[] = ['call', 'message', 'meeting', 'other']

function CheckInSection({ studentId }: { studentId: string }) {
  const { t, locale } = useI18n()
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const [note, setNote] = React.useState('')
  const [fieldError, setFieldError] = React.useState<string | null>(null)

  const query = useQuery({
    queryKey: ['mentor', 'checkins', studentId],
    queryFn: () => mentorAPI.checkIns(studentId),
  })

  const add = useMutation({
    mutationFn: () => mentorAPI.addCheckIn(studentId, note.trim()),
    onSuccess: () => {
      setNote('')
      setFieldError(null)
      queryClient.invalidateQueries({ queryKey: ['mentor', 'checkins', studentId] })
      queryClient.invalidateQueries({ queryKey: ['mentor', 'mentees'] })
      toast({ variant: 'success', title: t('mentor.checkIns.added') })
    },
    onError: (err) => {
      const parsed = parseApiError(err)
      setFieldError(parsed.fields.note ?? parsed.message)
    },
  })

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (note.trim()) add.mutate()
  }

  const rows = [...(query.data ?? [])].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  )

  return (
    <section className="space-y-3">
      <h2 className="flex items-center gap-2 text-xl font-semibold">
        <NotebookPen className="h-5 w-5" /> {t('mentor.checkIns.title')}
      </h2>

      <Card>
        <CardContent className="p-5">
          <form onSubmit={submit} className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="checkin-note">{t('mentor.checkIns.noteLabel')}</Label>
              <Textarea
                id="checkin-note"
                value={note}
                onChange={(e) => {
                  setNote(e.target.value)
                  setFieldError(null)
                }}
                rows={3}
                placeholder={t('mentor.checkIns.notePlaceholder')}
                aria-invalid={fieldError ? true : undefined}
              />
              <FieldError message={fieldError ?? undefined} />
            </div>
            <Button type="submit" loading={add.isPending} disabled={!note.trim()}>
              <MessageSquarePlus className="h-4 w-4" /> {t('mentor.checkIns.add')}
            </Button>
          </form>
        </CardContent>
      </Card>

      {query.isLoading && <div className="h-20 animate-pulse rounded-xl bg-muted" />}

      {rows.length === 0 && !query.isLoading ? (
        <Card>
          <CardContent className="p-6 text-sm text-muted-foreground">
            {t('mentor.checkIns.empty')}
          </CardContent>
        </Card>
      ) : (
        rows.length > 0 && (
          <Card>
            <CardContent className="divide-y divide-border p-0">
              {rows.map((row) => (
                <div key={row.id} className="space-y-1 p-4">
                  <p className="whitespace-pre-wrap text-sm">{row.note}</p>
                  <p className="text-xs text-muted-foreground">
                    {(row.mentor?.fullName || row.mentor?.email || '') + ' · '}
                    {format(new Date(row.createdAt), 'PPp', {
                      locale: locale === 'uz' ? uzDate : undefined,
                    })}
                  </p>
                </div>
              ))}
            </CardContent>
          </Card>
        )
      )}
    </section>
  )
}

function ParentContactSection({
  studentId,
  guardians,
}: {
  studentId: string
  guardians: { id: string; name: string; relation: string }[]
}) {
  const { t, locale } = useI18n()
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const [guardian, setGuardian] = React.useState('')
  const [method, setMethod] = React.useState<ContactMethod>('call')
  const [note, setNote] = React.useState('')
  const [fieldError, setFieldError] = React.useState<string | null>(null)

  const query = useQuery({
    queryKey: ['mentor', 'parent-contacts', studentId],
    queryFn: () => mentorAPI.parentContacts(studentId),
  })

  const add = useMutation({
    mutationFn: () =>
      mentorAPI.addParentContact(studentId, { guardian, method, note: note.trim() }),
    onSuccess: () => {
      setNote('')
      setFieldError(null)
      queryClient.invalidateQueries({ queryKey: ['mentor', 'parent-contacts', studentId] })
      toast({ variant: 'success', title: t('mentor.parentContacts.added') })
    },
    onError: (err) => {
      const parsed = parseApiError(err)
      setFieldError(parsed.fields.guardian ?? parsed.message)
    },
  })

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (guardian) add.mutate()
  }

  const rows = [...(query.data ?? [])].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  )

  return (
    <section className="space-y-3">
      <h2 className="flex items-center gap-2 text-xl font-semibold">
        <Phone className="h-5 w-5" /> {t('mentor.parentContacts.title')}
      </h2>

      <Card>
        <CardContent className="p-5">
          {guardians.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t('mentor.parentContacts.noGuardians')}</p>
          ) : (
            <form onSubmit={submit} className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>{t('mentor.parentContacts.guardianLabel')}</Label>
                  <Select value={guardian} onValueChange={setGuardian}>
                    <SelectTrigger aria-label={t('mentor.parentContacts.guardianLabel')}>
                      <SelectValue placeholder={t('mentor.parentContacts.guardianPlaceholder')} />
                    </SelectTrigger>
                    <SelectContent>
                      {guardians.map((g) => (
                        <SelectItem key={g.id} value={g.id}>
                          {g.name} · {t(`mentor.relation.${g.relation}`)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>{t('mentor.parentContacts.methodLabel')}</Label>
                  <Select value={method} onValueChange={(v) => setMethod(v as ContactMethod)}>
                    <SelectTrigger aria-label={t('mentor.parentContacts.methodLabel')}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CONTACT_METHODS.map((m) => (
                        <SelectItem key={m} value={m}>
                          {t(`mentor.parentContacts.method.${m}`)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="contact-note">{t('mentor.parentContacts.noteLabel')}</Label>
                <Textarea
                  id="contact-note"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  rows={2}
                  placeholder={t('mentor.parentContacts.notePlaceholder')}
                />
                <FieldError message={fieldError ?? undefined} />
              </div>
              <Button type="submit" loading={add.isPending} disabled={!guardian}>
                <Phone className="h-4 w-4" /> {t('mentor.parentContacts.log')}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>

      {query.isLoading && <div className="h-20 animate-pulse rounded-xl bg-muted" />}

      {rows.length === 0 && !query.isLoading ? (
        <Card>
          <CardContent className="p-6 text-sm text-muted-foreground">
            {t('mentor.parentContacts.empty')}
          </CardContent>
        </Card>
      ) : (
        rows.length > 0 && (
          <Card>
            <CardContent className="divide-y divide-border p-0">
              {rows.map((row) => (
                <div key={row.id} className="space-y-1 p-4">
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary">{t(`mentor.parentContacts.method.${row.method}`)}</Badge>
                    <span className="text-sm font-medium">{row.guardianName}</span>
                  </div>
                  {row.note && <p className="whitespace-pre-wrap text-sm">{row.note}</p>}
                  <p className="text-xs text-muted-foreground">
                    {(row.author?.fullName || row.author?.email || '') + ' · '}
                    {format(new Date(row.createdAt), 'PPp', {
                      locale: locale === 'uz' ? uzDate : undefined,
                    })}
                  </p>
                </div>
              ))}
            </CardContent>
          </Card>
        )
      )}
    </section>
  )
}

export function MenteeDetail({ studentId }: { studentId: string }) {
  const { t, locale } = useI18n()
  const { data, isLoading, isError } = useQuery({
    queryKey: ['mentor', 'mentee', studentId],
    queryFn: () => mentorAPI.menteeDetail(studentId),
  })

  return (
    <div className="space-y-6">
      <Link
        href="/teacher/mentees"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> {t('mentor.detail.back')}
      </Link>

      {isLoading && <div className="h-24 animate-pulse rounded-xl bg-muted" />}

      {isError && (
        <Card>
          <CardContent className="p-5 text-sm text-muted-foreground">
            {t('mentor.detail.loadFailed')}
          </CardContent>
        </Card>
      )}

      {data && (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <div className="min-w-0">
              <h1 className="text-2xl font-bold tracking-tight">
                {data.student.fullName || data.student.email}
              </h1>
              {data.mentorAssignedAt && (
                <p className="text-sm text-muted-foreground">
                  {t('mentor.detail.since', {
                    date: format(new Date(data.mentorAssignedAt), 'PP', {
                      locale: locale === 'uz' ? uzDate : undefined,
                    }),
                  })}
                </p>
              )}
            </div>
            <Badge variant={STATUS_VARIANT[data.status]}>{t(`mentor.status.${data.status}`)}</Badge>
          </div>

          <CheckInSection studentId={studentId} />
          <ParentContactSection studentId={studentId} guardians={data.guardians} />
        </>
      )}
    </div>
  )
}
