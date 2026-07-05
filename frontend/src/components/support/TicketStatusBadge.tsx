// Domain: Support
// Description: Ticket status → colored Badge + localized label.
'use client'

import { useT } from '@/lib/i18n/I18nProvider'
import { Badge } from '@/components/ui/badge'
import type { TicketStatus } from '@/types'

const VARIANT: Record<TicketStatus, 'warning' | 'success' | 'secondary'> = {
  open: 'warning',
  answered: 'success',
  closed: 'secondary',
}

export function TicketStatusBadge({ status }: { status: TicketStatus }) {
  const t = useT()
  return <Badge variant={VARIANT[status]}>{t(`support.ticketStatus.${status}`)}</Badge>
}
