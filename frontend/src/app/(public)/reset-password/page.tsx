// Domain: Public (auth)
// Description: Set a new password from the code that was emailed.
//
// The address arrives in the query string from /forgot-password (a convenience,
// not a credential — the code is the credential, and it is checked server-side
// against that address). It stays editable so the page also works pasted into a
// second device.
'use client'

import * as React from 'react'
import { Suspense } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { CheckCircle2 } from 'lucide-react'
import { authAPI } from '@/lib/api/auth'
import { useToast } from '@/components/ui/toast'
import { useT } from '@/lib/i18n/I18nProvider'
import { parseApiError } from '@/lib/api/errors'
import { Button, buttonVariants } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { FieldError } from '@/components/ui/field-error'
import { cn } from '@/lib/utils/cn'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { CODE_LENGTH, CodeInput } from '@/components/auth/CodeInput'
import { retryAfterFrom, useResendCooldown } from '@/components/auth/useResendCooldown'

function ResetPasswordInner() {
  const router = useRouter()
  const params = useSearchParams()
  const { toast } = useToast()
  const t = useT()

  const [email, setEmail] = React.useState(params.get('email') ?? '')
  const [code, setCode] = React.useState('')
  const [password, setPassword] = React.useState('')
  const [submitting, setSubmitting] = React.useState(false)
  const [codeError, setCodeError] = React.useState<string | null>(null)
  const [passwordError, setPasswordError] = React.useState<string | null>(null)
  const [done, setDone] = React.useState(false)
  const cooldown = useResendCooldown(params.get('email') ? 60 : 0)

  const submit = async () => {
    setSubmitting(true)
    setCodeError(null)
    setPasswordError(null)
    try {
      await authAPI.confirmPasswordReset({
        email: email.trim(),
        code,
        newPassword: password,
      })
      setDone(true)
    } catch (err) {
      const parsed = parseApiError(err)
      if (parsed.fields.newPassword) {
        setPasswordError(parsed.fields.newPassword)
      } else {
        setCodeError(parsed.message)
        setCode('')
      }
    } finally {
      setSubmitting(false)
    }
  }

  const resend = async () => {
    if (!email.trim()) return
    try {
      await authAPI.requestPasswordReset(email.trim())
      cooldown.start(60)
      toast({ variant: 'success', title: t('auth.reset.resentTitle') })
    } catch (err) {
      cooldown.start(retryAfterFrom(err))
      toast({ variant: 'error', title: t('auth.reset.failed') })
    }
  }

  if (done) {
    return (
      <Card>
        <CardHeader className="items-center text-center">
          <CheckCircle2 className="h-12 w-12 text-success" />
          <CardTitle>{t('auth.reset.doneTitle')}</CardTitle>
          <CardDescription>{t('auth.reset.doneBody')}</CardDescription>
        </CardHeader>
        <CardContent>
          <Link href="/login" className={cn(buttonVariants(), 'w-full')}>
            {t('auth.reset.goToLogin')}
          </Link>
        </CardContent>
      </Card>
    )
  }

  const ready = email.trim() !== '' && code.length === CODE_LENGTH && password.length >= 8

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('auth.reset.title')}</CardTitle>
        <CardDescription>
          {email ? t('auth.reset.codeSentTo', { email }) : t('auth.reset.subtitle')}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form
          method="post"
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault()
            if (ready) void submit()
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="reset-email">{t('auth.fields.email')}</Label>
            <Input
              id="reset-email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="reset-code">{t('auth.reset.codeLabel')}</Label>
            <CodeInput
              label={t('auth.reset.codeLabel')}
              value={code}
              onChange={setCode}
              disabled={submitting}
              autoFocus={Boolean(params.get('email'))}
            />
            {codeError && <FieldError message={codeError} />}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="reset-password">{t('auth.reset.newPassword')}</Label>
            <Input
              id="reset-password"
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            {passwordError && <FieldError message={passwordError} />}
          </div>

          <Button type="submit" className="w-full" loading={submitting} disabled={!ready}>
            {t('auth.reset.submit')}
          </Button>
        </form>

        <div className="mt-4 space-y-3">
          <Button
            variant="outline"
            className="w-full"
            disabled={cooldown.active || !email.trim()}
            onClick={resend}
          >
            {cooldown.active
              ? t('auth.verify.resendIn', { seconds: cooldown.seconds })
              : t('auth.reset.resend')}
          </Button>
          <button
            type="button"
            onClick={() => router.push('/login')}
            className="block w-full text-center text-sm text-primary hover:underline"
          >
            {t('auth.forgot.backToLogin')}
          </button>
        </div>
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
