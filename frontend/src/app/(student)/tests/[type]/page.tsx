// Domain: Student / Assessments
// Description: /tests/<slug> — every paper of one type. The slug set is closed
//   (see components/tests/examTypes.ts); anything else is a 404.
'use client'

import { notFound } from 'next/navigation'
import { ExamTypeView } from '@/components/tests/ExamTypeView'
import { examTypeBySlug } from '@/components/tests/examTypes'

export default function TestTypePage({ params }: { params: { type: string } }) {
  const meta = examTypeBySlug(params.type)
  if (!meta) notFound()
  return (
    <div className="mx-auto max-w-6xl">
      <ExamTypeView meta={meta} />
    </div>
  )
}
