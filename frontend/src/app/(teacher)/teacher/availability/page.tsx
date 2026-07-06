// Domain: Support (teacher)
// Description: A teacher's availability editor — publish weekly hours to become
//   bookable for 1:1 support.
'use client'

import { useT } from '@/lib/i18n/I18nProvider'
import { AvailabilityEditor } from '@/components/support/AvailabilityEditor'

export default function TeacherAvailabilityPage() {
  const t = useT()
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t('teacher.availability.title')}</h1>
        <p className="text-muted-foreground">{t('teacher.availability.subtitle')}</p>
      </div>
      <AvailabilityEditor />
    </div>
  )
}
