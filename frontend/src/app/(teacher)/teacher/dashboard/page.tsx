// Domain: Academy (teacher)
// Description: Teacher dashboard — the landing surface for the teacher shell.
import { TeacherDashboard } from '@/components/teacher/TeacherDashboard'

export const metadata = { title: 'Teacher dashboard' }

export default function TeacherDashboardPage() {
  return (
    <div className="mx-auto max-w-5xl">
      <TeacherDashboard />
    </div>
  )
}
