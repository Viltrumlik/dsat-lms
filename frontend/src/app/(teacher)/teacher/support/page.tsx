// Domain: Support (teacher)
// Description: Teacher support dashboard — incoming 1:1 bookings to manage.
'use client'

import { useT } from '@/lib/i18n/I18nProvider'
import { StaffBookings } from '@/components/support/StaffBookings'

export default function TeacherSupportPage() {
  const t = useT()
  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t('teacher.support.title')}</h1>
        <p className="text-muted-foreground">{t('teacher.support.subtitle')}</p>
      </div>
      <StaffBookings />
    </div>
  )
}
