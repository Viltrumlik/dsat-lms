// Domain: Test Engine
// Description: Jump grid for the current section. Shows answered / flagged /
//   current state. SAT-style: navigation is within the active section only.
'use client'

import { Flag } from 'lucide-react'
import { useSessionStore } from '@/lib/stores/sessionStore'
import { useT } from '@/lib/i18n/I18nProvider'
import { cn } from '@/lib/utils/cn'

export function QuestionNavigator({ onJump }: { onJump?: () => void }) {
  const t = useT()
  const sectionIndex = useSessionStore((s) => s.currentSectionIndex)
  const section = useSessionStore((s) => s.sections[s.currentSectionIndex])
  const currentQuestionIndex = useSessionStore((s) => s.currentQuestionIndex)
  const questionStates = useSessionStore((s) => s.questionStates)
  const navigateTo = useSessionStore((s) => s.navigateTo)

  if (!section) return null

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium">
          {section.title || t('testEngine.section', { number: section.sectionNumber })}
        </span>
        <span className="text-muted-foreground">
          {t('testEngine.questionsCount', { count: section.questions.length })}
        </span>
      </div>
      <div className="grid grid-cols-6 gap-2 sm:grid-cols-8 md:grid-cols-10">
        {section.questions.map((q, idx) => {
          const st = questionStates[q.id]
          const answered = st?.answer != null && st.answer !== ''
          const flagged = st?.flagged
          const current = idx === currentQuestionIndex
          return (
            <button
              key={q.id}
              type="button"
              onClick={() => {
                navigateTo(sectionIndex, idx)
                onJump?.()
              }}
              className={cn(
                'relative flex h-10 items-center justify-center rounded-md border text-sm font-medium transition-colors',
                current
                  ? 'border-primary ring-2 ring-primary'
                  : answered
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-border bg-background hover:bg-muted'
              )}
              aria-current={current}
            >
              {idx + 1}
              {flagged && (
                <Flag className="absolute -right-1 -top-1 h-3.5 w-3.5 fill-warning text-warning" />
              )}
            </button>
          )
        })}
      </div>
      <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded bg-primary" /> {t('testEngine.answered')}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded border border-border" /> {t('testEngine.unanswered')}
        </span>
        <span className="flex items-center gap-1.5">
          <Flag className="h-3 w-3 fill-warning text-warning" /> {t('testEngine.flaggedLegend')}
        </span>
      </div>
    </div>
  )
}
