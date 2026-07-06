// Domain: Support
// Description: Book a Teacher — the student booking wizard.
'use client'

import { useT } from '@/lib/i18n/I18nProvider'
import { BookingWizard } from '@/components/support/BookingWizard'

export default function BookTeacherPage() {
  const t = useT()
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t('support.book.title')}</h1>
        <p className="text-muted-foreground">{t('support.book.subtitle')}</p>
      </div>
      <BookingWizard />
    </div>
  )
}
