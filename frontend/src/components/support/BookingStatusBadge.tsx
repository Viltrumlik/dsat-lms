// Domain: Support
// Description: Booking status → colored Badge + localized label. Shared by the
//   student My Sessions list and the teacher booking dashboard.
'use client'

import { useT } from '@/lib/i18n/I18nProvider'
import { Badge } from '@/components/ui/badge'
import type { BookingStatus } from '@/types'

const VARIANT: Record<BookingStatus, 'default' | 'secondary' | 'success' | 'warning' | 'error'> = {
  pending: 'warning',
  confirmed: 'default',
  completed: 'success',
  cancelled: 'secondary',
  no_show: 'error',
}

export function BookingStatusBadge({ status }: { status: BookingStatus }) {
  const t = useT()
  return <Badge variant={VARIANT[status]}>{t(`support.status.${status}`)}</Badge>
}
