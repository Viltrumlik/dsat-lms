// Domain: Academy (teacher)
// Description: The homework-submission grading queue (paginated).
import { GradingQueue } from '@/components/teacher/GradingQueue'

export const metadata = { title: 'Grading' }

export default function TeacherGradingPage() {
  return (
    <div className="mx-auto max-w-3xl">
      <GradingQueue />
    </div>
  )
}
