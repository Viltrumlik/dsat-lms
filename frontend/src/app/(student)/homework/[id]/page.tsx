// Domain: Homework
// Description: Homework detail — instructions + start-test / submit actions.
import { HomeworkDetail } from '@/components/homework/HomeworkDetail'

export const metadata = { title: 'Homework' }

export default function HomeworkDetailPage({ params }: { params: { id: string } }) {
  return (
    <div className="mx-auto max-w-3xl">
      <HomeworkDetail id={params.id} />
    </div>
  )
}
