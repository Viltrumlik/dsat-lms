// Domain: Student
// Description: Student dashboard — greeting, summary stats, available tests,
//   recent sessions. Shows a soft email-verification banner when unverified.
'use client'

import * as React from 'react'
import { MailWarning } from 'lucide-react'
import { useAuth } from '@/lib/auth/AuthProvider'
import { authAPI } from '@/lib/api/auth'
import { useToast } from '@/components/ui/toast'
import { useT } from '@/lib/i18n/I18nProvider'
import { parseApiError } from '@/lib/api/errors'
import { Button } from '@/components/ui/button'
import { SummaryCards } from '@/components/dashboard/SummaryCards'
import { GoalCard } from '@/components/dashboard/GoalCard'
import { AvailableTests } from '@/components/dashboard/AvailableTests'
import { RecentSessions } from '@/components/dashboard/RecentSessions'

function VerifyBanner() {
  const { toast } = useToast()
  const t = useT()
  const [sending, setSending] = React.useState(false)

  const resend = async () => {
    setSending(true)
    try {
      await authAPI.resendVerification()
      toast({
        variant: 'success',
        title: t('dashboard.verifyBanner.sentTitle'),
        description: t('dashboard.verifyBanner.sentDesc'),
      })
    } catch (err) {
      toast({
        variant: 'error',
        title: t('dashboard.verifyBanner.resendFailed'),
        description: parseApiError(err).message,
      })
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-warning/40 bg-warning-light/60 p-4 text-warning-dark sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-3">
        <MailWarning className="h-5 w-5 shrink-0" />
        <p className="text-sm font-medium">{t('dashboard.verifyBanner.text')}</p>
      </div>
      <Button size="sm" variant="outline" loading={sending} onClick={resend}>
        {t('dashboard.verifyBanner.resend')}
      </Button>
    </div>
  )
}

export default function DashboardPage() {
  const { user } = useAuth()
  const t = useT()

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          {user ? t('dashboard.welcome', { name: user.firstName }) : t('dashboard.welcomeShort')}
        </h1>
        <p className="text-muted-foreground">{t('dashboard.subtitle')}</p>
      </div>

      {user && !user.isEmailVerified && <VerifyBanner />}

      <GoalCard />
      <SummaryCards />
      <AvailableTests />
      <RecentSessions />
    </div>
  )
}
