// Domain: Academy (teacher)
// Description: Teacher classes — list + create.
'use client'

import { useT } from '@/lib/i18n/I18nProvider'
import { ClassesView } from '@/components/teacher/ClassesView'

export default function TeacherClassesPage() {
  const t = useT()
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t('teacher.classes.title')}</h1>
        <p className="text-muted-foreground">{t('teacher.classes.subtitle')}</p>
      </div>
      <ClassesView />
    </div>
  )
}
