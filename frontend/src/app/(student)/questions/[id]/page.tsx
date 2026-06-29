// Domain: Question Bank
// Description: Study a single question (passage, stem, choices, answer, explanation).
import { QuestionStudy } from '@/components/question-bank/QuestionStudy'

export const metadata = { title: 'Study question' }

export default function QuestionDetailPage({ params }: { params: { id: string } }) {
  return <QuestionStudy id={params.id} />
}
