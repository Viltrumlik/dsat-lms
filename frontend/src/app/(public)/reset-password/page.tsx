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
        toast({ variant: 'error', title: 'Reset failed', description: parsed.message })
      }
    }
  }

  if (!hasLink) {
    return (
      <Card>
        <CardHeader className="items-center text-center">
          <XCircle className="h-12 w-12 text-error" />
          <CardTitle>Invalid reset link</CardTitle>
          <CardDescription>This link is missing or malformed.</CardDescription>
        </CardHeader>
        <CardContent>
          <Link
            href="/forgot-password"
            className={cn(buttonVariants({ variant: 'outline' }), 'w-full')}
          >
            Request a new link
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
          <CardTitle>Password updated</CardTitle>
          <CardDescription>You can now sign in with your new password.</CardDescription>
        </CardHeader>
        <CardContent>
          <Button className="w-full" onClick={() => router.replace('/login')}>
            Sign in
          </Button>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Choose a new password</CardTitle>
        <CardDescription>Enter and confirm your new password.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
          <div>
            <Label htmlFor="password">New password</Label>
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
            <Label htmlFor="confirmPassword">Confirm password</Label>
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
            Update password
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
