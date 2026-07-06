// Domain: Support
// Description: Office Hours — browse and join group drop-in sessions.
'use client'

import { useT } from '@/lib/i18n/I18nProvider'
import { OfficeHoursBrowse } from '@/components/support/OfficeHoursBrowse'

export default function OfficeHoursPage() {
  const t = useT()
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t('support.officeHours.title')}</h1>
        <p className="text-muted-foreground">{t('support.officeHours.subtitle')}</p>
      </div>
      <OfficeHoursBrowse />
    </div>
  )
}
