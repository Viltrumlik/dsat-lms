// Domain: Academy (teacher)
// Description: Class detail — roster + enroll-by-email.
import { ClassRoster } from '@/components/teacher/ClassRoster'

export const metadata = { title: 'Class roster' }

export default function TeacherClassDetailPage({ params }: { params: { id: string } }) {
  return (
    <div className="mx-auto max-w-4xl">
      <ClassRoster classId={params.id} />
    </div>
  )
}
