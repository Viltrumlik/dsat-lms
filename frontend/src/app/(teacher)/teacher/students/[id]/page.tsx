// Domain: Academy (teacher)
// Description: Per-student analytics drilldown (reached from a class roster),
//   plus a mentor-assignment card (admins only; self-hides otherwise).
import { StudentAnalytics } from '@/components/teacher/StudentAnalytics'
import { MentorAssignCard } from '@/components/teacher/MentorAssignCard'

export const metadata = { title: 'Student analytics' }

export default function TeacherStudentPage({
  params,
  searchParams,
}: {
  params: { id: string }
  searchParams: { class?: string; from?: string }
}) {
  const backHref =
    searchParams.from === 'students'
      ? '/teacher/students'
      : searchParams.class
        ? `/teacher/classes/${searchParams.class}`
        : '/teacher/classes'
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <StudentAnalytics studentId={params.id} backHref={backHref} />
      <MentorAssignCard studentId={params.id} />
    </div>
  )
}
