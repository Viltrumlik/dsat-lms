// Domain: Courses (student)
// Description: The lesson player for one course.
'use client'

import { CoursePlayer } from '@/components/courses/CoursePlayer'

export default function CoursePlayerPage({ params }: { params: { id: string } }) {
  return (
    <div className="mx-auto max-w-5xl">
      <CoursePlayer courseId={params.id} />
    </div>
  )
}
