// Domain: Admin (content studio)
// Description: Deep link into the workspace with one question selected.
'use client'

import { QuestionsPanel } from '@/components/admin/questions/QuestionsPanel'

export default function EditQuestionPage({ params }: { params: { id: string } }) {
  return <QuestionsPanel initialQuestionId={params.id} />
}
