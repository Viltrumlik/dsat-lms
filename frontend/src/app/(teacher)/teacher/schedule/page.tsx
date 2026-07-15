// Domain: Academy (staff)
// Description: Class schedule — recurring rules + upcoming sessions (teacher nav).
import { ScheduleView } from '@/components/teacher/ScheduleView'

export const metadata = { title: 'Schedule' }

export default function TeacherSchedulePage() {
  return (
    <div className="mx-auto max-w-4xl">
      <ScheduleView />
    </div>
  )
}
