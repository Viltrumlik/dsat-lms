// Domain: Admin (content studio)
// Description: Deep link into the workspace with a blank draft open.
'use client'

import { QuestionsPanel } from '@/components/admin/questions/QuestionsPanel'

export default function NewQuestionPage() {
  return <QuestionsPanel initialCreating />
}
