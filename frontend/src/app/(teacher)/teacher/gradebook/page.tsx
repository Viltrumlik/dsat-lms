// Domain: Academy (staff)
// Description: Teacher gradebook — grades across a class (teacher nav).
import { GradebookView } from '@/components/gradebook/GradebookView'

export const metadata = { title: 'Gradebook' }

export default function TeacherGradebookPage() {
  return (
    <div className="mx-auto max-w-6xl">
      <GradebookView />
    </div>
  )
}
