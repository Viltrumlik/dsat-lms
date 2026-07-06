// Domain: Support
// Description: My Sessions — the student's 1:1 support bookings.
'use client'

import Link from 'next/link'
import { CalendarPlus } from 'lucide-react'
import { useT } from '@/lib/i18n/I18nProvider'
import { buttonVariants } from '@/components/ui/button'
import { SessionsList } from '@/components/support/SessionsList'

export default function SupportSessionsPage() {
  const t = useT()
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t('support.sessions.title')}</h1>
          <p className="text-muted-foreground">{t('support.sessions.subtitle')}</p>
        </div>
        <Link href="/support/book" className={buttonVariants()}>
          <CalendarPlus className="h-4 w-4" /> {t('support.sessions.bookCta')}
        </Link>
      </div>
      <SessionsList />
    </div>
  )
}
