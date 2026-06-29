// Domain: Question Bank
// Description: Browse and filter the published question bank.
import { QuestionBrowser } from '@/components/question-bank/QuestionBrowser'

export const metadata = { title: 'Question Bank' }

export default function QuestionsPage() {
  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Question Bank</h1>
        <p className="text-muted-foreground">Browse and study published Digital SAT questions.</p>
      </div>
      <QuestionBrowser />
    </div>
  )
}
