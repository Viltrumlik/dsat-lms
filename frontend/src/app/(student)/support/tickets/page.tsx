// Domain: Support
// Description: Ask a Question — the student's support tickets.
'use client'

import { useT } from '@/lib/i18n/I18nProvider'
import { TicketsList } from '@/components/support/TicketsList'

export default function SupportTicketsPage() {
  const t = useT()
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t('support.tickets.title')}</h1>
        <p className="text-muted-foreground">{t('support.tickets.subtitle')}</p>
      </div>
      <TicketsList />
    </div>
  )
}
