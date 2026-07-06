// Domain: Academy (mentor)
// Description: Assign / clear a student's academic mentor. Shown on the student
//   drilldown to admins only (the assign endpoint is admin/academic_manager, and
//   academic_managers don't share the teacher shell). Assign is by email, mirroring
//   enroll-by-email. Reads the current mentor from the CRM profile endpoint.
'use client'

import * as React from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { HeartHandshake, UserMinus, UserPlus } from 'lucide-react'
import { studentsAPI } from '@/lib/api/students'
import { mentorAPI } from '@/lib/api/mentor'
import { parseApiError } from '@/lib/api/errors'
import { useI18n } from '@/lib/i18n/I18nProvider'
import { useAuth } from '@/lib/auth/AuthProvider'
import { useToast } from '@/components/ui/toast'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { FieldError } from '@/components/ui/field-error'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export function MentorAssignCard({ studentId }: { studentId: string }) {
  const { t } = useI18n()
  const { user } = useAuth()
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const [email, setEmail] = React.useState('')
  const [fieldError, setFieldError] = React.useState<string | null>(null)

  // Only admins reach the teacher shell AND may assign — hide otherwise.
  const canAssign = user?.role === 'admin'

  const profileQuery = useQuery({
    queryKey: ['student-profile', studentId],
    queryFn: () => studentsAPI.getProfile(studentId),
    enabled: canAssign,
  })

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['student-profile', studentId] })
    queryClient.invalidateQueries({ queryKey: ['mentor'] })
  }

  const assign = useMutation({
    mutationFn: () => mentorAPI.assign(studentId, email.trim()),
    onSuccess: () => {
      setEmail('')
      setFieldError(null)
      invalidate()
      toast({ variant: 'success', title: t('mentor.assign.assigned') })
    },
    onError: (err) => {
      const parsed = parseApiError(err)
      setFieldError(parsed.fields.email ?? parsed.fields.mentor ?? parsed.message)
    },
  })

  const unassign = useMutation({
    mutationFn: () => mentorAPI.unassign(studentId),
    onSuccess: () => {
      invalidate()
      toast({ variant: 'success', title: t('mentor.assign.cleared') })
    },
    onError: (err) => toast({ variant: 'error', title: parseApiError(err).message }),
  })

  if (!canAssign) return null

  const mentor = profileQuery.data?.mentor ?? null

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (email.trim()) assign.mutate()
  }

  return (
    <Card>
      <CardContent className="space-y-4 p-5">
        <div className="flex items-center gap-2">
          <HeartHandshake className="h-5 w-5 text-muted-foreground" />
          <h2 className="text-lg font-semibold">{t('mentor.assign.title')}</h2>
        </div>

        {mentor ? (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm">
              {t('mentor.assign.current')}{' '}
              <span className="font-medium">{mentor.fullName || mentor.email}</span>
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              loading={unassign.isPending}
              onClick={() => unassign.mutate()}
            >
              <UserMinus className="h-4 w-4" /> {t('mentor.assign.clear')}
            </Button>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">{t('mentor.assign.none')}</p>
        )}

        <form onSubmit={submit} className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="flex-1 space-y-2">
            <Label htmlFor="mentor-email">{t('mentor.assign.emailLabel')}</Label>
            <Input
              id="mentor-email"
              type="email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value)
                setFieldError(null)
              }}
              placeholder={t('mentor.assign.emailPlaceholder')}
              aria-invalid={fieldError ? true : undefined}
            />
            <FieldError message={fieldError ?? undefined} />
          </div>
          <Button type="submit" loading={assign.isPending} disabled={!email.trim()}>
            <UserPlus className="h-4 w-4" /> {mentor ? t('mentor.assign.reassign') : t('mentor.assign.assign')}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
