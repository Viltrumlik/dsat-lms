// Domain: Academy (classroom)
// Description: Who is in the class. A student sees their classmates by name —
//   as Google Classroom shows them — and staff see addresses plus the enrol-by-
//   email form, which is the one management action that belongs on this page.
'use client'

import * as React from 'react'
import Link from 'next/link'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { UserPlus } from 'lucide-react'
import { classesAPI } from '@/lib/api/classes'
import { teacherAPI } from '@/lib/api/teacher'
import { parseApiError } from '@/lib/api/errors'
import { useT } from '@/lib/i18n/I18nProvider'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Spinner } from '@/components/ui/spinner'
import { useToast } from '@/components/ui/toast'
import type { ClassCapabilities, ClassPerson } from '@/types'

function Initials({ name }: { name: string }) {
  const initials = name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('')
  return (
    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary-100 text-sm font-semibold text-primary-700 dark:bg-primary-800/40 dark:text-primary-200">
      {initials || '?'}
    </span>
  )
}

function PersonRow({
  person,
  capabilities,
}: {
  person: ClassPerson
  capabilities: ClassCapabilities
}) {
  const row = (
    <div className="flex items-center gap-3 px-4 py-3">
      <Initials name={person.fullName} />
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium">{person.fullName}</p>
        {person.email && <p className="truncate text-xs text-muted-foreground">{person.email}</p>}
      </div>
    </div>
  )
  // A teacher can open a student; a classmate cannot.
  if (!capabilities.isStaff) return row
  return (
    <Link
      href={`/teacher/students/${person.id}`}
      className="block transition-colors hover:bg-muted/60"
    >
      {row}
    </Link>
  )
}

function EnrolForm({ classId }: { classId: string }) {
  const t = useT()
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const [email, setEmail] = React.useState('')

  const enrol = useMutation({
    mutationFn: () => teacherAPI.enroll(classId, email.trim()),
    onSuccess: () => {
      setEmail('')
      queryClient.invalidateQueries({ queryKey: ['class-people', classId] })
      queryClient.invalidateQueries({ queryKey: ['class', classId] })
      toast({ title: t('teacher.roster.enrolledTitle') })
    },
    onError: (err) =>
      toast({
        variant: 'error',
        title: t('teacher.roster.enrollFailedTitle'),
        description: parseApiError(err).message,
      }),
  })

  return (
    <form
      className="flex gap-2 border-t border-border p-3"
      onSubmit={(e) => {
        e.preventDefault()
        if (email.trim()) enrol.mutate()
      }}
    >
      <Input
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder={t('teacher.roster.enrollPlaceholder')}
        aria-label={t('teacher.roster.enrollLabel')}
      />
      <Button type="submit" disabled={!email.trim()} loading={enrol.isPending}>
        <UserPlus className="h-4 w-4" /> {t('teacher.roster.enroll')}
      </Button>
    </form>
  )
}

export function PeopleTab({
  classId,
  capabilities,
}: {
  classId: string
  capabilities: ClassCapabilities
}) {
  const t = useT()
  const query = useQuery({
    queryKey: ['class-people', classId],
    queryFn: () => classesAPI.people(classId),
  })

  if (query.isLoading) {
    return (
      <div className="flex justify-center py-12">
        <Spinner className="h-5 w-5" />
      </div>
    )
  }
  if (!query.data) return null

  const { teacher, students } = query.data

  return (
    <div className="space-y-5">
      <section className="space-y-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          {t('classroom.people.teacher')}
        </h2>
        <Card>
          <CardContent className="p-0">
            {teacher ? (
              <PersonRow person={teacher} capabilities={{ ...capabilities, isStaff: false }} />
            ) : (
              <p className="p-4 text-sm text-muted-foreground">{t('classroom.people.noTeacher')}</p>
            )}
          </CardContent>
        </Card>
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          {t('classroom.people.students', { count: students.length })}
        </h2>
        <Card>
          <CardContent className="p-0">
            <div className="divide-y divide-border">
              {students.map((person) => (
                <PersonRow key={person.id} person={person} capabilities={capabilities} />
              ))}
            </div>
            {students.length === 0 && (
              <p className="p-6 text-center text-sm text-muted-foreground">
                {t('classroom.people.empty')}
              </p>
            )}
            {capabilities.canManageRoster && <EnrolForm classId={classId} />}
          </CardContent>
        </Card>
      </section>
    </div>
  )
}
