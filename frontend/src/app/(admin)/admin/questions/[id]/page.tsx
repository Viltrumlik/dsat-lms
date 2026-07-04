// Domain: Admin (content studio)
// Description: Edit / review a question.
'use client'

import { QuestionEditor } from '@/components/admin/QuestionEditor'

export default function EditQuestionPage({ params }: { params: { id: string } }) {
  return (
    <div className="mx-auto max-w-6xl">
      <QuestionEditor mode="edit" questionId={params.id} />
    </div>
  )
}
