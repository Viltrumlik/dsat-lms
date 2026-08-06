// Domain: Test Engine
// Description: The Bluebook jump grid — dashed cells for unanswered, solid blue
//   for answered, a location pin over the current one, a red flag for marked.
//   Navigation stays inside the active section, as in the real exam.
'use client'

import { MapPin, X } from 'lucide-react'
import { useSessionStore } from '@/lib/stores/sessionStore'
import { useT } from '@/lib/i18n/I18nProvider'
import { cn } from '@/lib/utils/cn'
import { sectionLabel } from './examLabels'

interface QuestionNavigatorProps {
  onJump?: () => void
  onClose?: () => void
  onGoToReview?: () => void
}

export function QuestionNavigator({ onJump, onClose, onGoToReview }: QuestionNavigatorProps) {
  const t = useT()
  const sections = useSessionStore((s) => s.sections)
  const sectionIndex = useSessionStore((s) => s.currentSectionIndex)
  const section = useSessionStore((s) => s.sections[s.currentSectionIndex])
  const currentQuestionIndex = useSessionStore((s) => s.currentQuestionIndex)
  const questionStates = useSessionStore((s) => s.questionStates)
  const navigateTo = useSessionStore((s) => s.navigateTo)

  if (!section) return null

  return (
    <div className="w-[min(92vw,600px)] rounded-xl bg-white px-6 pb-5 pt-4 shadow-2xl">
      <div className="relative">
        <h2 className="px-8 text-center text-[19px] font-bold text-bb-ink">
          {t('testEngine.navigatorTitle', {
            section: sectionLabel(sections, sectionIndex, t),
          })}
        </h2>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label={t('common.close')}
            className="absolute right-0 top-0 text-bb-ink transition-opacity hover:opacity-70"
          >
            <X className="h-6 w-6" />
          </button>
        )}
      </div>

      {/* Legend */}
      <div className="mt-4 flex items-center justify-center gap-8 border-y border-neutral-300 py-2.5 text-[15px] text-bb-ink">
        <span className="flex items-center gap-1.5">
          <MapPin className="h-4 w-4" /> {t('testEngine.legend.current')}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-4 w-4 border border-dashed border-bb-ink" aria-hidden />
          {t('testEngine.legend.unanswered')}
        </span>
        <span className="flex items-center gap-1.5">
          <FlagGlyph /> {t('testEngine.legend.forReview')}
        </span>
      </div>

      {/* Grid */}
      <div className="mt-5 grid grid-cols-10 justify-items-center gap-x-2 gap-y-6">
        {section.questions.map((q, idx) => {
          const st = questionStates[q.id]
          const answered = st?.answer != null && st.answer !== ''
          const flagged = st?.flagged
          const current = idx === currentQuestionIndex
          return (
            <div key={q.id} className="relative">
              {current && (
                <MapPin
                  className="absolute -top-6 left-1/2 h-5 w-5 -translate-x-1/2 text-bb-ink"
                  aria-hidden
                />
              )}
              {flagged && (
                <span className="absolute -right-1.5 -top-2.5 z-10" aria-hidden>
                  <FlagGlyph />
                </span>
              )}
              <button
                type="button"
                aria-current={current}
                aria-label={t('testEngine.goToQuestion', { number: idx + 1 })}
                onClick={() => {
                  navigateTo(sectionIndex, idx)
                  onJump?.()
                }}
                className={cn(
                  'flex h-9 w-9 items-center justify-center text-[17px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bb-blue',
                  answered
                    ? 'bg-bb-blue text-white'
                    : 'border border-dashed border-bb-ink bg-white text-bb-blue hover:bg-neutral-100',
                  current && 'underline underline-offset-2'
                )}
              >
                {idx + 1}
              </button>
            </div>
          )
        })}
      </div>

      {onGoToReview && (
        <div className="mt-6 flex justify-center">
          <button
            type="button"
            onClick={onGoToReview}
            className="rounded-full border border-bb-blue px-6 py-2 text-[16px] font-semibold text-bb-blue transition-colors hover:bg-bb-blue hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bb-blue focus-visible:ring-offset-2"
          >
            {t('testEngine.goToReviewPage')}
          </button>
        </div>
      )}
    </div>
  )
}

function FlagGlyph() {
  return (
    <svg viewBox="0 0 14 18" className="pointer-events-none h-[18px] w-[14px]" aria-hidden>
      <path d="M0 0h14v15l-7-4-7 4V0Z" fill="#9E3038" />
    </svg>
  )
}
