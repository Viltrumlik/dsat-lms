// Domain: Courses (student)
// Description: A student's assigned courses.
'use client'

import { useT } from '@/lib/i18n/I18nProvider'
import { CoursesBrowse } from '@/components/courses/CoursesBrowse'

export default function CoursesPage() {
  const t = useT()
  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t('courses.title')}</h1>
        <p className="text-muted-foreground">{t('courses.subtitle')}</p>
      </div>
      <CoursesBrowse />
    </div>
  )
}
