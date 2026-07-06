// Domain: Support (teacher)
// Description: Teacher office hours — recurring templates + upcoming sessions
//   (roster, attendance, cancel).
'use client'

import { useT } from '@/lib/i18n/I18nProvider'
import { OfficeHourTemplates } from '@/components/support/OfficeHourTemplates'
import { StaffOfficeHours } from '@/components/support/StaffOfficeHours'

export default function TeacherOfficeHoursPage() {
  const t = useT()
  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t('teacher.officeHours.title')}</h1>
        <p className="text-muted-foreground">{t('teacher.officeHours.subtitle')}</p>
      </div>
      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          {t('teacher.officeHours.templatesHeading')}
        </h2>
        <OfficeHourTemplates />
      </section>
      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          {t('teacher.officeHours.sessionsHeading')}
        </h2>
        <StaffOfficeHours />
      </section>
    </div>
  )
}
