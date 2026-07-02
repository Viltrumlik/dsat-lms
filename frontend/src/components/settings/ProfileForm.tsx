// Domain: Identity (settings)
// Description: Self-service profile — name, SAT target score, exam date.
//   PATCHes /auth/me/ and syncs the AuthProvider user on success.
'use client'

import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { authAPI } from '@/lib/api/auth'
import { useAuth } from '@/lib/auth/AuthProvider'
import { useToast } from '@/components/ui/toast'
import { useT } from '@/lib/i18n/I18nProvider'
import { parseApiError } from '@/lib/api/errors'
import { profileSchema, type ProfileValues } from '@/lib/validations/settings'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { FieldError } from '@/components/ui/field-error'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import type { User } from '@/types'

export function ProfileForm({ user }: { user: User }) {
  const { setUser } = useAuth()
  const { toast } = useToast()
  const t = useT()

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<ProfileValues>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      firstName: user.firstName,
      lastName: user.lastName,
      satTargetScore: user.satTargetScore?.toString() ?? '',
      examDate: user.examDate ?? '',
    },
  })

  const onSubmit = async (values: ProfileValues) => {
    try {
      const { user: updated } = await authAPI.updateMe({
        firstName: values.firstName.trim(),
        lastName: values.lastName.trim(),
        satTargetScore: values.satTargetScore.trim() === '' ? null : Number(values.satTargetScore),
        examDate: values.examDate === '' ? null : values.examDate,
      })
      setUser(updated)
      toast({ variant: 'success', title: t('settings.profile.savedTitle') })
    } catch (err) {
      const parsed = parseApiError(err)
      let mapped = false
      for (const [field, message] of Object.entries(parsed.fields)) {
        if (
          field === 'firstName' ||
          field === 'lastName' ||
          field === 'satTargetScore' ||
          field === 'examDate'
        ) {
          setError(field, { message })
          mapped = true
        }
      }
      if (!mapped) {
        toast({
          variant: 'error',
          title: t('settings.profile.saveFailed'),
          description: parsed.message,
        })
      }
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('settings.profile.title')}</CardTitle>
        <CardDescription>{t('settings.profile.subtitle')}</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="firstName">{t('settings.profile.firstName')}</Label>
              <Input
                id="firstName"
                autoComplete="given-name"
                aria-invalid={!!errors.firstName}
                {...register('firstName')}
              />
              <FieldError message={errors.firstName?.message} />
            </div>
            <div>
              <Label htmlFor="lastName">{t('settings.profile.lastName')}</Label>
              <Input
                id="lastName"
                autoComplete="family-name"
                aria-invalid={!!errors.lastName}
                {...register('lastName')}
              />
              <FieldError message={errors.lastName?.message} />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="satTargetScore">{t('settings.profile.targetScore')}</Label>
              <Input
                id="satTargetScore"
                type="number"
                min={400}
                max={1600}
                step={10}
                placeholder="1400"
                aria-invalid={!!errors.satTargetScore}
                {...register('satTargetScore')}
              />
              <FieldError message={errors.satTargetScore?.message} />
            </div>
            <div>
              <Label htmlFor="examDate">{t('settings.profile.examDate')}</Label>
              <Input
                id="examDate"
                type="date"
                aria-invalid={!!errors.examDate}
                {...register('examDate')}
              />
              <FieldError message={errors.examDate?.message} />
            </div>
          </div>

          <div className="flex justify-end">
            <Button type="submit" loading={isSubmitting} disabled={!isDirty}>
              {t('settings.profile.save')}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}
