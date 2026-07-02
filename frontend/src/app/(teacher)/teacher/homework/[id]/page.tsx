// Domain: Homework (teacher)
// Description: Homework submissions per student.
import { HomeworkSubmissions } from '@/components/teacher/HomeworkSubmissions'

export const metadata = { title: 'Homework submissions' }

export default function TeacherHomeworkDetailPage({ params }: { params: { id: string } }) {
  return (
    <div className="mx-auto max-w-4xl">
      <HomeworkSubmissions homeworkId={params.id} />
    </div>
  )
}
