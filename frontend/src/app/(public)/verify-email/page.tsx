// Domain: Public (auth)
// Description: Confirms an email from uid+token in the link, or shows a
//   "check your email" prompt with a resend button for the logged-in user.
'use client'

import * as React from 'react'
import { Suspense } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { CheckCircle2, MailCheck, XCircle } from 'lucide-react'
import { authAPI } from '@/lib/api/auth'
import { useAuth } from '@/lib/auth/AuthProvider'
import { useToast } from '@/components/ui/toast'
import { useT } from '@/lib/i18n/I18nProvider'
import { parseApiError } from '@/lib/api/errors'
import { Button, buttonVariants } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { cn } from '@/lib/utils/cn'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

type Status = 'idle' | 'confirming' | 'confirmed' | 'failed'

function VerifyEmailInner() {
  const params = useSearchParams()
  const uid = params.get('uid')
  const token = params.get('token')
  const hasLink = Boolean(uid && token)

  const { isAuthenticated, refreshUser } = useAuth()
  const { toast } = useToast()
  const t = useT()

  const [status, setStatus] = React.useState<Status>(hasLink ? 'confirming' : 'idle')
  const [resending, setResending] = React.useState(false)
  const confirmed = React.useRef(false)

  React.useEffect(() => {
    if (!hasLink || confirmed.current) return
    confirmed.current = true
    ;(async () => {
      try {
        await authAPI.confirmVerification({ uid: uid as string, token: token as string })
        setStatus('confirmed')
        try {
          await refreshUser()
        } catch {
          // user may not be logged in on this device — that's fine
        }
      } catch {
        setStatus('failed')
      }
    })()
  }, [hasLink, uid, token, refreshUser])

  const resend = async () => {
    setResending(true)
    try {
      await authAPI.resendVerification()
      toast({
        variant: 'success',
        title: t('auth.verify.resentTitle'),
        description: t('auth.verify.resentDesc'),
      })
    } catch (err) {
      toast({
        variant: 'error',
        title: t('auth.verify.resendFailed'),
        description: parseApiError(err).message,
      })
    } finally {
      setResending(false)
    }
  }

  if (status === 'confirming') {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-4 py-12">
          <Spinner className="h-8 w-8" />
          <p className="text-sm text-muted-foreground">{t('auth.verify.verifying')}</p>
        </CardContent>
      </Card>
    )
  }

  if (status === 'confirmed') {
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

  if (status === 'failed') {
    return (
      <Card>
        <CardHeader className="items-center text-center">
          <XCircle className="h-12 w-12 text-error" />
          <CardTitle>{t('auth.verify.failed')}</CardTitle>
          <CardDescription>{t('auth.verify.failedBody')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {isAuthenticated && (
            <Button className="w-full" loading={resending} onClick={resend}>
              {t('auth.verify.resend')}
            </Button>
          )}
          <Link
            href="/dashboard"
            className="block text-center text-sm text-primary hover:underline"
          >
            {t('auth.verify.continueToDashboard')}
          </Link>
        </CardContent>
      </Card>
    )
  }

  // idle — no link params (post-registration prompt)
  return (
    <Card>
      <CardHeader className="items-center text-center">
        <MailCheck className="h-12 w-12 text-primary" />
        <CardTitle>{t('auth.verify.checkEmail')}</CardTitle>
        <CardDescription>{t('auth.verify.checkEmailBody')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {isAuthenticated ? (
          <Button className="w-full" variant="outline" loading={resending} onClick={resend}>
            {t('auth.verify.resend')}
          </Button>
        ) : (
          <p className="text-center text-sm text-muted-foreground">
            <Link href="/login" className="text-primary hover:underline">
              {t('auth.register.signIn')}
            </Link>{' '}
            {t('auth.verify.toResend')}
          </p>
        )}
        <Link
          href="/dashboard"
          className="block text-center text-sm text-primary hover:underline"
        >
          {t('auth.verify.continueToDashboard')}
        </Link>
      </CardContent>
    </Card>
  )
}

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={null}>
      <VerifyEmailInner />
    </Suspense>
  )
}
