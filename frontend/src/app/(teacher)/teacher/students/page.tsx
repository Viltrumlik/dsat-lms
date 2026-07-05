// Domain: Academy (teacher)
// Description: All students across the teacher's classes (paginated + searchable).
import { StudentsView } from '@/components/teacher/StudentsView'

export const metadata = { title: 'Students' }

export default function TeacherStudentsPage() {
  return (
    <div className="mx-auto max-w-4xl">
      <StudentsView />
    </div>
  )
}
