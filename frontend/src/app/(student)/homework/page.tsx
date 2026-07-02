// Domain: Homework
// Description: Student homework list — assignments from the student's classes.
'use client'

import { useT } from '@/lib/i18n/I18nProvider'
import { HomeworkList } from '@/components/homework/HomeworkList'

export default function HomeworkPage() {
  const t = useT()
  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t('homework.title')}</h1>
        <p className="text-muted-foreground">{t('homework.subtitle')}</p>
      </div>
      <HomeworkList />
    </div>
  )
}
