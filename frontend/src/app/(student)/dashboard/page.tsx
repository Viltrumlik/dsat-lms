// Domain: Student
// Description: Student dashboard — greeting, summary stats, available tests,
//   recent sessions. Shows a soft email-verification banner when unverified.
'use client'

import * as React from 'react'
import { MailWarning } from 'lucide-react'
import { useAuth } from '@/lib/auth/AuthProvider'
import { authAPI } from '@/lib/api/auth'
import { useToast } from '@/components/ui/toast'
import { parseApiError } from '@/lib/api/errors'
import { Button } from '@/components/ui/button'
import { SummaryCards } from '@/components/dashboard/SummaryCards'
import { AvailableTests } from '@/components/dashboard/AvailableTests'
import { RecentSessions } from '@/components/dashboard/RecentSessions'

function VerifyBanner() {
  const { toast } = useToast()
  const [sending, setSending] = React.useState(false)

  const resend = async () => {
    setSending(true)
    try {
      await authAPI.resendVerification()
      toast({ variant: 'success', title: 'Sent', description: 'Check your inbox for the link.' })
    } catch (err) {
      toast({ variant: 'error', title: 'Could not resend', description: parseApiError(err).message })
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-warning/40 bg-warning-light/60 p-4 text-warning-dark sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-3">
        <MailWarning className="h-5 w-5 shrink-0" />
        <p className="text-sm font-medium">
          Please verify your email address to secure your account.
        </p>
      </div>
      <Button size="sm" variant="outline" loading={sending} onClick={resend}>
        Resend email
      </Button>
    </div>
  )
}

export default function DashboardPage() {
  const { user } = useAuth()

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          Welcome back{user ? `, ${user.firstName}` : ''}.
        </h1>
        <p className="text-muted-foreground">Here&apos;s where your prep stands.</p>
      </div>

      {user && !user.isEmailVerified && <VerifyBanner />}

      <SummaryCards />
      <AvailableTests />
      <RecentSessions />
    </div>
  )
}
