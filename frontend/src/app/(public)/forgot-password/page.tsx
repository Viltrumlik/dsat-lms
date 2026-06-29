// Domain: Public (auth)
// Description: Request a password-reset link.
'use client'

import * as React from 'react'
import Link from 'next/link'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { MailCheck } from 'lucide-react'
import { authAPI } from '@/lib/api/auth'
import { useT } from '@/lib/i18n/I18nProvider'
import { forgotPasswordSchema, type ForgotPasswordValues } from '@/lib/validations/auth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { FieldError } from '@/components/ui/field-error'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

export default function ForgotPasswordPage() {
  const t = useT()
  const [sent, setSent] = React.useState(false)
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ForgotPasswordValues>({ resolver: zodResolver(forgotPasswordSchema) })

  const onSubmit = async (values: ForgotPasswordValues) => {
    // Always succeeds server-side (never reveals whether the account exists).
    try {
      await authAPI.requestPasswordReset(values.email)
    } finally {
      setSent(true)
    }
  }

  if (sent) {
    return (
      <Card>
        <CardHeader className="items-center text-center">
          <MailCheck className="h-12 w-12 text-primary" />
          <CardTitle>{t('auth.forgot.sentTitle')}</CardTitle>
          <CardDescription>{t('auth.forgot.sentBody')}</CardDescription>
        </CardHeader>
        <CardContent>
          <Link href="/login" className="block text-center text-sm text-primary hover:underline">
            {t('auth.forgot.backToLogin')}
          </Link>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('auth.forgot.title')}</CardTitle>
        <CardDescription>{t('auth.forgot.subtitle')}</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
          <div>
            <Label htmlFor="email">{t('auth.forgot.email')}</Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              aria-invalid={!!errors.email}
              {...register('email')}
            />
            <FieldError message={errors.email?.message} />
          </div>
          <Button type="submit" className="w-full" loading={isSubmitting}>
            {t('auth.forgot.submit')}
          </Button>
        </form>
      </CardContent>
      <div className="border-t border-border px-6 py-4 text-center text-sm text-muted-foreground">
        <Link href="/login" className="font-medium text-primary hover:underline">
          {t('auth.forgot.backToLogin')}
        </Link>
      </div>
    </Card>
  )
}
