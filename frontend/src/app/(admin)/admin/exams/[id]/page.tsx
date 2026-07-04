// Domain: Admin (exam builder)
// Description: Assemble a single exam — sections + questions.
'use client'

import { ExamBuilder } from '@/components/admin/ExamBuilder'

export default function ExamBuilderPage({ params }: { params: { id: string } }) {
  return (
    <div className="mx-auto max-w-4xl">
      <ExamBuilder examId={params.id} />
    </div>
  )
}
