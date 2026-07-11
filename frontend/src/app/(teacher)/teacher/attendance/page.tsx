// Domain: Academy (staff)
// Description: Attendance — sessions + per-student marking (reached from teacher nav).
import { AttendanceView } from '@/components/teacher/AttendanceView'

export const metadata = { title: 'Attendance' }

export default function TeacherAttendancePage() {
  return (
    <div className="mx-auto max-w-5xl">
      <AttendanceView />
    </div>
  )
}
