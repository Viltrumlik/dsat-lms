// Domain: Academy (teacher)
// Description: Per-student analytics drilldown (reached from a class roster).
import { StudentAnalytics } from '@/components/teacher/StudentAnalytics'

export const metadata = { title: 'Student analytics' }

export default function TeacherStudentPage({
  params,
  searchParams,
}: {
  params: { id: string }
  searchParams: { class?: string }
}) {
  const backHref = searchParams.class
    ? `/teacher/classes/${searchParams.class}`
    : '/teacher/classes'
  return (
    <div className="mx-auto max-w-4xl">
      <StudentAnalytics studentId={params.id} backHref={backHref} />
    </div>
  )
}
