// Domain: Public (auth)
// Description: Enter the six-digit code that was emailed, or ask for another.
//
// The address is prefilled from the logged-in user (the usual case, straight
// after signing up) and otherwise typed — a student who signed up on a laptop
// can finish on a phone, which is the whole reason this is a code and not a link.
'use client'

import * as React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { CheckCircle2, MailCheck } from 'lucide-react'
import { authAPI } from '@/lib/api/auth'
import { useAuth } from '@/lib/auth/AuthProvider'
import { useToast } from '@/components/ui/toast'
import { useT } from '@/lib/i18n/I18nProvider'
import { parseApiError } from '@/lib/api/errors'
import { localizeApiError } from '@/lib/api/localizeError'
import { Button, buttonVariants } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils/cn'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { CODE_LENGTH, CodeInput } from '@/components/auth/CodeInput'
import { retryAfterFrom, useResendCooldown } from '@/components/auth/useResendCooldown'

export default function VerifyEmailPage() {
  const { user, isAuthenticated, refreshUser } = useAuth()
  const { toast } = useToast()
  const router = useRouter()
  const t = useT()

  const [email, setEmail] = React.useState('')
  const [code, setCode] = React.useState('')
  const [submitting, setSubmitting] = React.useState(false)
  const [resending, setResending] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [done, setDone] = React.useState(false)
  // A code went out with the account, so the button starts cold rather than
  // inviting a click the server will refuse.
  const cooldown = useResendCooldown(isAuthenticated ? 60 : 0)

  React.useEffect(() => {
    if (user?.email) setEmail(user.email)
  }, [user?.email])

  const confirm = async (value: string) => {
    if (value.length < CODE_LENGTH || !email.trim()) return
    setSubmitting(true)
    setError(null)
    try {
      await authAPI.confirmVerification({ email: email.trim(), code: value })
      setDone(true)
      try {
        await refreshUser()
      } catch {
        // Verifying from a device that isn't logged in is fine.
      }
    } catch (err) {
      setError(localizeApiError(t, parseApiError(err)))
      setCode('')
    } finally {
      setSubmitting(false)
    }
  }

  const resend = async () => {
    setResending(true)
    setError(null)
    try {
      await authAPI.resendVerification()
      cooldown.start(60)
      toast({
        variant: 'success',
        title: t('auth.verify.resentTitle'),
        description: t('auth.verify.resentDesc'),
      })
    } catch (err) {
      const parsed = parseApiError(err)
      if (parsed.code === 'EMAIL_RATE_LIMITED') cooldown.start(retryAfterFrom(err))
      toast({
        variant: 'error',
        title: t('auth.verify.resendFailed'),
        description: localizeApiError(t, parsed),
      })
    } finally {
      setResending(false)
    }
  }

  if (done) {
    return (
      <Card>
        <CardHeader className="items-center text-center">
          <CheckCircle2 className="h-12 w-12 text-success" />
          <CardTitle>{t('auth.verify.verified')}</CardTitle>
          <CardDescription>{t('auth.verify.verifiedBody')}</CardDescription>
        </CardHeader>
        <CardContent>
          <Link href="/dashboard" className={cn(buttonVariants(), 'w-full')}>
            {t('common.goToDashboard')}
          </Link>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader className="items-center text-center">
        <MailCheck className="h-12 w-12 text-primary" />
        <CardTitle>{t('auth.verify.checkEmail')}</CardTitle>
        <CardDescription>
          {email ? t('auth.verify.codeSentTo', { email }) : t('auth.verify.checkEmailBody')}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form
          method="post"
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault()
            void confirm(code)
          }}
        >
          {!isAuthenticated && (
            <div className="space-y-1.5">
              <Label htmlFor="verify-email">{t('auth.fields.email')}</Label>
              <Input
                id="verify-email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="verify-code">{t('auth.verify.codeLabel')}</Label>
            <CodeInput
              label={t('auth.verify.codeLabel')}
              value={code}
              onChange={setCode}
              onComplete={(value) => void confirm(value)}
              disabled={submitting}
              autoFocus={isAuthenticated}
            />
            {error && <p className="text-sm text-error">{error}</p>}
          </div>

          <Button
            type="submit"
            className="w-full"
            loading={submitting}
            disabled={code.length < CODE_LENGTH || !email.trim()}
          >
            {t('auth.verify.confirm')}
          </Button>
        </form>

        <div className="mt-4 space-y-3">
          {isAuthenticated ? (
            <Button
              className="w-full"
              variant="outline"
              loading={resending}
              disabled={cooldown.active}
              onClick={resend}
            >
              {cooldown.active
                ? t('auth.verify.resendIn', { seconds: cooldown.seconds })
                : t('auth.verify.resend')}
            </Button>
          ) : (
            <p className="text-center text-sm text-muted-foreground">
              <Link href="/login" className="text-primary hover:underline">
                {t('auth.register.signIn')}
              </Link>{' '}
              {t('auth.verify.toResend')}
            </p>
          )}
          <button
            type="button"
            onClick={() => router.push('/dashboard')}
            className="block w-full text-center text-sm text-primary hover:underline"
          >
            {t('auth.verify.continueToDashboard')}
          </button>
        </div>
      </CardContent>
    </Card>
  )
}
