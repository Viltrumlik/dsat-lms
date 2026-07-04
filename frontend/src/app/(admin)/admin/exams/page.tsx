// Domain: Admin (exam builder)
// Description: Exam-template directory.
'use client'

import { useT } from '@/lib/i18n/I18nProvider'
import { ExamsView } from '@/components/admin/ExamsView'

export default function AdminExamsPage() {
  const t = useT()
  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t('admin.exams.title')}</h1>
        <p className="text-muted-foreground">{t('admin.exams.subtitle')}</p>
      </div>
      <ExamsView />
    </div>
  )
}
