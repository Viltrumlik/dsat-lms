// Domain: Admin (content studio)
// Description: Author a new question (draft).
'use client'

import { QuestionEditor } from '@/components/admin/QuestionEditor'

export default function NewQuestionPage() {
  return (
    <div className="mx-auto max-w-6xl">
      <QuestionEditor mode="create" />
    </div>
  )
}
