// Domain: Public (auth)
// Description: Request a password-reset link.
'use client'

import * as React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
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
  const router = useRouter()
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
      // Straight to the code screen, carrying the address so the student does
      // not retype it. Always — the request endpoint deliberately answers the
      // same whether or not an account exists, and branching here would undo
      // that.
      router.push(`/reset-password?email=${encodeURIComponent(values.email)}`)
    }
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
