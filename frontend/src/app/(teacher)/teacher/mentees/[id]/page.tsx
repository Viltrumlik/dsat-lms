// Domain: Academy (mentor)
// Description: A mentor's per-mentee drilldown — check-ins + parent contacts.
import { MenteeDetail } from '@/components/teacher/MenteeDetail'

export const metadata = { title: 'Mentee' }

export default function MenteePage({ params }: { params: { id: string } }) {
  return (
    <div className="mx-auto max-w-3xl">
      <MenteeDetail studentId={params.id} />
    </div>
  )
}
