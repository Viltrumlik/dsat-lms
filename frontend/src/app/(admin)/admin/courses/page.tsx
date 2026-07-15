// Domain: Admin (course system)
// Description: Course directory.
'use client'

import { useT } from '@/lib/i18n/I18nProvider'
import { CoursesView } from '@/components/admin/CoursesView'

export default function AdminCoursesPage() {
  const t = useT()
  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t('admin.courses.title')}</h1>
        <p className="text-muted-foreground">{t('admin.courses.subtitle')}</p>
      </div>
      <CoursesView />
    </div>
  )
}
