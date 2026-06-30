// Domain: Public (auth)
// Description: Self-registration (always creates a public user).
'use client'

import * as React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useAuth } from '@/lib/auth/AuthProvider'
import { useToast } from '@/components/ui/toast'
import { useT } from '@/lib/i18n/I18nProvider'
import { parseApiError } from '@/lib/api/errors'
import { registerSchema, type RegisterValues } from '@/lib/validations/auth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { FieldError } from '@/components/ui/field-error'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

const FIELD_KEYS = ['firstName', 'lastName', 'email', 'password'] as const

export default function RegisterPage() {
  const router = useRouter()
  const { register: registerUser, isAuthenticated, isLoading } = useAuth()
  const { toast } = useToast()
  const t = useT()

  // Set when this form just registered, so the "already-authed → dashboard"
  // guard below doesn't override the intentional redirect to /verify-email.
  const justRegistered = React.useRef(false)

  React.useEffect(() => {
    if (!isLoading && isAuthenticated && !justRegistered.current) {
      router.replace('/dashboard')
    }
  }, [isLoading, isAuthenticated, router])

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<RegisterValues>({ resolver: zodResolver(registerSchema) })

  const onSubmit = async (values: RegisterValues) => {
    try {
      justRegistered.current = true
      await registerUser({
        firstName: values.firstName,
        lastName: values.lastName,
        email: values.email,
        password: values.password,
      })
      toast({
        variant: 'success',
        title: t('auth.register.createdTitle'),
        description: t('auth.register.createdDesc'),
      })
      router.replace('/verify-email')
    } catch (err) {
      const parsed = parseApiError(err)
      let mapped = false
      for (const key of FIELD_KEYS) {
        if (parsed.fields[key]) {
          setError(key, { message: parsed.fields[key] })
          mapped = true
        }
      }
      if (!mapped) {
        toast({ variant: 'error', title: t('auth.register.failed'), description: parsed.message })
      }
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('auth.register.title')}</CardTitle>
        <CardDescription>{t('auth.register.subtitle')}</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="firstName">{t('auth.register.firstName')}</Label>
              <Input
                id="firstName"
                autoComplete="given-name"
                aria-invalid={!!errors.firstName}
                {...register('firstName')}
              />
              <FieldError message={errors.firstName?.message} />
            </div>
            <div>
              <Label htmlFor="lastName">{t('auth.register.lastName')}</Label>
              <Input
                id="lastName"
                autoComplete="family-name"
                aria-invalid={!!errors.lastName}
                {...register('lastName')}
              />
              <FieldError message={errors.lastName?.message} />
            </div>
          </div>
          <div>
            <Label htmlFor="email">{t('auth.register.email')}</Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              aria-invalid={!!errors.email}
              {...register('email')}
            />
            <FieldError message={errors.email?.message} />
          </div>
          <div>
            <Label htmlFor="password">{t('auth.register.password')}</Label>
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
            <Label htmlFor="confirmPassword">{t('auth.register.confirmPassword')}</Label>
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
            {t('auth.register.submit')}
          </Button>
        </form>
      </CardContent>
      <div className="border-t border-border px-6 py-4 text-center text-sm text-muted-foreground">
        {t('auth.register.haveAccount')}{' '}
        <Link href="/login" className="font-medium text-primary hover:underline">
          {t('auth.register.signIn')}
        </Link>
      </div>
    </Card>
  )
}
