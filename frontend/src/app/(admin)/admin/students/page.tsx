// Domain: Admin (CRM)
// Description: The CRM student directory (distinct from Users).
'use client'

import { useT } from '@/lib/i18n/I18nProvider'
import { StudentsDirectory } from '@/components/admin/StudentsDirectory'

export default function AdminStudentsPage() {
  const t = useT()
  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t('admin.students.title')}</h1>
        <p className="text-muted-foreground">{t('admin.students.subtitle')}</p>
      </div>
      <StudentsDirectory />
    </div>
  )
}
