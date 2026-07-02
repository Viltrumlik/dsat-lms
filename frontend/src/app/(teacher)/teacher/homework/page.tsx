// Domain: Homework (teacher)
// Description: Teacher homework — assignments table + assign dialog.
'use client'

import { useT } from '@/lib/i18n/I18nProvider'
import { TeacherHomework } from '@/components/teacher/TeacherHomework'

export default function TeacherHomeworkPage() {
  const t = useT()
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t('teacher.homework.title')}</h1>
        <p className="text-muted-foreground">{t('teacher.homework.subtitle')}</p>
      </div>
      <TeacherHomework />
    </div>
  )
}
