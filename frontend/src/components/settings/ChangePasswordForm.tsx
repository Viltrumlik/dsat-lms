// Domain: Identity (settings)
// Description: Authenticated password change (verifies the current password
//   server-side). The backend blacklists other refresh tokens on success.
'use client'

import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { authAPI } from '@/lib/api/auth'
import { useToast } from '@/components/ui/toast'
import { useT } from '@/lib/i18n/I18nProvider'
import { parseApiError } from '@/lib/api/errors'
import { changePasswordSchema, type ChangePasswordValues } from '@/lib/validations/settings'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { FieldError } from '@/components/ui/field-error'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

export function ChangePasswordForm() {
  const { toast } = useToast()
  const t = useT()

  const {
    register,
    handleSubmit,
    setError,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<ChangePasswordValues>({ resolver: zodResolver(changePasswordSchema) })

  const onSubmit = async (values: ChangePasswordValues) => {
    try {
      await authAPI.changePassword({
        currentPassword: values.currentPassword,
        newPassword: values.newPassword,
      })
      reset()
      toast({
        variant: 'success',
        title: t('settings.password.changedTitle'),
        description: t('settings.password.changedDesc'),
      })
    } catch (err) {
      const parsed = parseApiError(err)
      let mapped = false
      for (const [field, message] of Object.entries(parsed.fields)) {
        if (field === 'currentPassword' || field === 'newPassword') {
          setError(field, { message })
          mapped = true
        }
      }
      if (!mapped) {
        toast({
          variant: 'error',
          title: t('settings.password.changeFailed'),
          description: parsed.message,
        })
      }
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('settings.password.title')}</CardTitle>
        <CardDescription>{t('settings.password.subtitle')}</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
          <div>
            <Label htmlFor="currentPassword">{t('settings.password.current')}</Label>
            <Input
              id="currentPassword"
              type="password"
              autoComplete="current-password"
              aria-invalid={!!errors.currentPassword}
              {...register('currentPassword')}
            />
            <FieldError message={errors.currentPassword?.message} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="newPassword">{t('settings.password.new')}</Label>
              <Input
                id="newPassword"
                type="password"
                autoComplete="new-password"
                aria-invalid={!!errors.newPassword}
                {...register('newPassword')}
              />
              <FieldError message={errors.newPassword?.message} />
            </div>
            <div>
              <Label htmlFor="confirmPassword">{t('settings.password.confirm')}</Label>
              <Input
                id="confirmPassword"
                type="password"
                autoComplete="new-password"
                aria-invalid={!!errors.confirmPassword}
                {...register('confirmPassword')}
              />
              <FieldError message={errors.confirmPassword?.message} />
            </div>
          </div>
          <div className="flex justify-end">
            <Button type="submit" loading={isSubmitting}>
              {t('settings.password.submit')}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}
