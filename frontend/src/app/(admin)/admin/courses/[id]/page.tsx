// Domain: Admin (course builder)
// Description: Per-course builder — units, lessons, publish lifecycle.
'use client'

import { CourseBuilder } from '@/components/admin/CourseBuilder'

export default function AdminCourseBuilderPage({ params }: { params: { id: string } }) {
  return (
    <div className="mx-auto max-w-4xl">
      <CourseBuilder courseId={params.id} />
    </div>
  )
}
