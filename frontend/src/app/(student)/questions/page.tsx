// Domain: Question Bank
// Description: The bank — build a drill from the skills you want, or browse and
//   filter the whole thing. The builder sits first because practising a weak
//   skill is what a student is usually here to do; browsing is the fallback.
'use client'

import { useT } from '@/lib/i18n/I18nProvider'
import { PracticeBuilder } from '@/components/question-bank/PracticeBuilder'
import { QuestionBrowser } from '@/components/question-bank/QuestionBrowser'

export default function QuestionsPage() {
  const t = useT()
  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t('questionBank.title')}</h1>
        <p className="text-muted-foreground">{t('questionBank.subtitle')}</p>
      </div>

      <PracticeBuilder />

      <div className="space-y-4">
        <h2 className="text-lg font-semibold">{t('bank.browseTitle')}</h2>
        <QuestionBrowser />
      </div>
    </div>
  )
}
