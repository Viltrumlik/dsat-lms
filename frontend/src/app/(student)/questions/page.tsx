// Domain: Question Bank
// Description: Browse and filter the published question bank.
'use client'

import { useT } from '@/lib/i18n/I18nProvider'
import { QuestionBrowser } from '@/components/question-bank/QuestionBrowser'

export default function QuestionsPage() {
  const t = useT()
  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t('questionBank.title')}</h1>
        <p className="text-muted-foreground">{t('questionBank.subtitle')}</p>
      </div>
      <QuestionBrowser />
    </div>
  )
}
