// Domain: Public (auth)
// Description: Request a password-reset link.
'use client'

import * as React from 'react'
import Link from 'next/link'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { MailCheck } from 'lucide-react'
import { authAPI } from '@/lib/api/auth'
import { forgotPasswordSchema, type ForgotPasswordValues } from '@/lib/validations/auth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { FieldError } from '@/components/ui/field-error'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

export default function ForgotPasswordPage() {
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
          <CardTitle>Check your email</CardTitle>
          <CardDescription>
            If an account exists for that address, a reset link is on its way.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Link href="/login" className="block text-center text-sm text-primary hover:underline">
            Back to sign in
          </Link>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Reset your password</CardTitle>
        <CardDescription>We&apos;ll email you a link to choose a new one.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
          <div>
            <Label htmlFor="email">Email</Label>
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
            Send reset link
          </Button>
        </form>
      </CardContent>
      <div className="border-t border-border px-6 py-4 text-center text-sm text-muted-foreground">
        <Link href="/login" className="font-medium text-primary hover:underline">
          Back to sign in
        </Link>
      </div>
    </Card>
  )
}
