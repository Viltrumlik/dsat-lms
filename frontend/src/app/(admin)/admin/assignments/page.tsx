// Domain: Admin (exam assignments)
// Description: Assign exams to classes/students + track progress.
'use client'

import { useT } from '@/lib/i18n/I18nProvider'
import { AssignmentsView } from '@/components/admin/AssignmentsView'

export default function AdminAssignmentsPage() {
  const t = useT()
  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t('admin.assignments.title')}</h1>
        <p className="text-muted-foreground">{t('admin.assignments.subtitle')}</p>
      </div>
      <AssignmentsView />
    </div>
  )
}
