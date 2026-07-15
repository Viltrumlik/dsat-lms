// Domain: Academy (admin)
// Description: Admin gradebook — grades across any class (admin nav).
import { GradebookView } from '@/components/gradebook/GradebookView'

export const metadata = { title: 'Gradebook' }

export default function AdminGradebookPage() {
  return (
    <div className="mx-auto max-w-6xl">
      <GradebookView admin />
    </div>
  )
}
