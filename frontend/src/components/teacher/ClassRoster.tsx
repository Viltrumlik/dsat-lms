// Domain: Academy (teacher)
// Description: Class detail — active roster table + enroll-by-email form.
//   The class header comes from the (cached) classes list; there is no
//   single-class endpoint.
'use client'

import * as React from 'react'
import Link from 'next/link'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { format } from 'date-fns'
import { uz as uzDate } from 'date-fns/locale'
import { ArrowLeft, UserPlus, Users } from 'lucide-react'
import { teacherAPI } from '@/lib/api/teacher'
import { parseApiError } from '@/lib/api/errors'
import { useI18n } from '@/lib/i18n/I18nProvider'
import { useToast } from '@/components/ui/toast'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { FieldError } from '@/components/ui/field-error'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

function EnrollForm({ classId }: { classId: string }) {
  const { t } = useI18n()
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const [email, setEmail] = React.useState('')
  const [fieldError, setFieldError] = React.useState<string | null>(null)

  const enroll = useMutation({
    mutationFn: () => teacherAPI.enroll(classId, email.trim()),
    onSuccess: (entry) => {
      setEmail('')
      setFieldError(null)
      queryClient.invalidateQueries({ queryKey: ['teacher'] })
      toast({
        variant: 'success',
        title: t('teacher.roster.enrolledTitle'),
        description: entry.student.fullName || entry.student.email,
      })
    },
    onError: (err) => {
      const parsed = parseApiError(err)
      setFieldError(parsed.fields.email ?? parsed.message)
    },
  })

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (email.trim()) enroll.mutate()
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3 sm:flex-row sm:items-end">
      <div className="flex-1 space-y-2">
        <Label htmlFor="enroll-email">{t('teacher.roster.enrollLabel')}</Label>
        <Input
          id="enroll-email"
          type="email"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value)
            setFieldError(null)
          }}
          placeholder={t('teacher.roster.enrollPlaceholder')}
          aria-invalid={fieldError ? true : undefined}
        />
        <FieldError message={fieldError ?? undefined} />
      </div>
      <Button type="submit" loading={enroll.isPending} disabled={!email.trim()}>
        <UserPlus className="h-4 w-4" /> {t('teacher.roster.enroll')}
      </Button>
    </form>
  )
}

export function ClassRoster({ classId }: { classId: string }) {
  const { t, locale } = useI18n()

  const classesQuery = useQuery({
    queryKey: ['teacher', 'classes'],
    queryFn: teacherAPI.classes,
  })
  const klass = classesQuery.data?.find((c) => c.id === classId)

  const rosterQuery = useQuery({
    queryKey: ['teacher', 'roster', classId],
    queryFn: () => teacherAPI.roster(classId),
  })

  return (
    <div className="space-y-6">
      <Link
        href="/teacher/classes"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> {t('teacher.roster.backToClasses')}
      </Link>

      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          {klass?.name ?? t('teacher.roster.fallbackTitle')}
        </h1>
        <p className="text-muted-foreground">{t('teacher.roster.subtitle')}</p>
      </div>

      <Card>
        <CardContent className="p-5">
          <EnrollForm classId={classId} />
        </CardContent>
      </Card>

      {rosterQuery.isLoading && (
        <Card>
          <CardContent className="space-y-3 p-5">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-10 animate-pulse rounded bg-muted" />
            ))}
          </CardContent>
        </Card>
      )}

      {rosterQuery.isError && (
        <Card>
          <CardContent className="p-5 text-sm text-muted-foreground">
            {t('teacher.roster.loadFailed')}
          </CardContent>
        </Card>
      )}

      {rosterQuery.data && rosterQuery.data.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 p-10 text-center">
            <Users className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">{t('teacher.roster.empty')}</p>
          </CardContent>
        </Card>
      )}

      {rosterQuery.data && rosterQuery.data.length > 0 && (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('teacher.roster.student')}</TableHead>
                <TableHead>{t('teacher.roster.email')}</TableHead>
                <TableHead>{t('teacher.roster.enrolledAt')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rosterQuery.data.map((entry) => (
                <TableRow key={entry.id}>
                  <TableCell className="font-medium">
                    {entry.student.fullName || entry.student.email}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{entry.student.email}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {format(new Date(entry.createdAt), 'PP', {
                      locale: locale === 'uz' ? uzDate : undefined,
                    })}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  )
}
