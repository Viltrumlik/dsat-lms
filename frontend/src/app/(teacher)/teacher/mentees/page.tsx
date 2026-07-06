// Domain: Academy (mentor)
// Description: The mentor's mentee list (reached from the teacher sidebar).
import { MenteesList } from '@/components/teacher/MenteesList'

export const metadata = { title: 'My mentees' }

export default function MenteesPage() {
  return (
    <div className="mx-auto max-w-3xl">
      <MenteesList />
    </div>
  )
}
