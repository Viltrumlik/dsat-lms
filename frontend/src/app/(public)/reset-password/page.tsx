// Domain: Public (auth)
// Description: Set a new password from uid+token in the reset link.
'use client'

import * as React from 'react'
import { Suspense } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { CheckCircle2, XCircle } from 'lucide-react'
import { authAPI } from '@/lib/api/auth'
import { useToast } from '@/components/ui/toast'
import { useT } from '@/lib/i18n/I18nProvider'
import { parseApiError } from '@/lib/api/errors'
import { resetPasswordSchema, type ResetPasswordValues } from '@/lib/validations/auth'
import { Button, buttonVariants } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { FieldError } from '@/components/ui/field-error'
import { cn } from '@/lib/utils/cn'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

function ResetPasswordInner() {
  const router = useRouter()
  const params = useSearchParams()
  const uid = params.get('uid')
  const token = params.get('token')
  const hasLink = Boolean(uid && token)
  const { toast } = useToast()
  const t = useT()
  const [done, setDone] = React.useState(false)

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<ResetPasswordValues>({ resolver: zodResolver(resetPasswordSchema) })

  const onSubmit = async (values: ResetPasswordValues) => {
    try {
      await authAPI.confirmPasswordReset({
        uid: uid as string,
        token: token as string,
        newPassword: values.password,
      })
      setDone(true)
    } catch (err) {
      const parsed = parseApiError(err)
      if (parsed.fields.newPassword) {
        setError('password', { message: parsed.fields.newPassword })
      } else {
        toast({ variant: 'error', title: t('auth.reset.failed'), description: parsed.message })
      }
    }
  }

  if (!hasLink) {
    return (
      <Card>
        <CardHeader className="items-center text-center">
          <XCircle className="h-12 w-12 text-error" />
          <CardTitle>{t('auth.reset.invalidTitle')}</CardTitle>
          <CardDescription>{t('auth.reset.invalidBody')}</CardDescription>
        </CardHeader>
        <CardContent>
          <Link
            href="/forgot-password"
            className={cn(buttonVariants({ variant: 'outline' }), 'w-full')}
          >
            {t('auth.reset.requestNew')}
          </Link>
        </CardContent>
      </Card>
    )
  }

  if (done) {
    return (
      <Card>
        <CardHeader className="items-center text-center">
          <CheckCircle2 className="h-12 w-12 text-success" />
          <CardTitle>{t('auth.reset.successTitle')}</CardTitle>
          <CardDescription>{t('auth.reset.successDesc')}</CardDescription>
        </CardHeader>
        <CardContent>
          <Button className="w-full" onClick={() => router.replace('/login')}>
            {t('auth.reset.signIn')}
          </Button>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('auth.reset.title')}</CardTitle>
        <CardDescription>{t('auth.reset.subtitle')}</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
          <div>
            <Label htmlFor="password">{t('auth.reset.password')}</Label>
            <Input
              id="password"
              type="password"
              autoComplete="new-password"
              aria-invalid={!!errors.password}
              {...register('password')}
            />
            <FieldError message={errors.password?.message} />
          </div>
          <div>
            <Label htmlFor="confirmPassword">{t('auth.reset.confirmPassword')}</Label>
            <Input
              id="confirmPassword"
              type="password"
              autoComplete="new-password"
              aria-invalid={!!errors.confirmPassword}
              {...register('confirmPassword')}
            />
            <FieldError message={errors.confirmPassword?.message} />
          </div>
          <Button type="submit" className="w-full" loading={isSubmitting}>
            {t('auth.reset.submit')}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={null}>
      <ResetPasswordInner />
    </Suspense>
  )
}
