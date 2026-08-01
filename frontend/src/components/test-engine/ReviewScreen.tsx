// Domain: Test Engine
// Description: Bluebook's "Check Your Work" review page — the same jump grid as
//   the navigator, per section, with the submit action beneath it.
'use client'

import { MapPin } from 'lucide-react'
import { useSessionStore } from '@/lib/stores/sessionStore'
import { useT } from '@/lib/i18n/I18nProvider'
import { cn } from '@/lib/utils/cn'
import { sectionLabel } from './examLabels'

export function ReviewScreen({ onSubmit }: { onSubmit: () => void }) {
  const t = useT()
  const sections = useSessionStore((s) => s.sections)
  const questionStates = useSessionStore((s) => s.questionStates)
  const navigateTo = useSessionStore((s) => s.navigateTo)
  const setStatus = useSessionStore((s) => s.setStatus)

  const jumpTo = (sectionIdx: number, questionIdx: number) => {
    navigateTo(sectionIdx, questionIdx)
    setStatus('active')
  }

  return (
    <div className="flex-1 overflow-y-auto bg-white">
      <div className="mx-auto max-w-3xl px-6 py-10">
        <h2 className="text-center text-[26px] font-bold text-bb-ink">
          {t('testEngine.reviewScreen.heading')}
        </h2>
        <p className="mt-1 text-center text-[17px] text-neutral-700">
          {t('testEngine.reviewScreen.subtitle')}
        </p>

        {/* Legend */}
        <div className="mx-auto mt-7 flex max-w-lg items-center justify-center gap-8 border-y border-neutral-300 py-2.5 text-[15px] text-bb-ink">
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

        {sections.map((section, sIdx) => {
          const answered = section.questions.filter((q) => {
            const a = questionStates[q.id]?.answer
            return a != null && a !== ''
          }).length
          return (
            <section key={sIdx} className="mt-8">
              <div className="flex items-baseline justify-between gap-4">
                <h3 className="text-[19px] font-bold text-bb-ink">
                  {sectionLabel(sections, sIdx, t)}
                </h3>
                <span className="text-[15px] text-neutral-700">
                  {t('testEngine.reviewScreen.answeredOf', {
                    answered,
                    total: section.questions.length,
                  })}
                </span>
              </div>
              <div className="mt-5 grid grid-cols-10 justify-items-center gap-x-2 gap-y-6">
                {section.questions.map((q, qIdx) => {
                  const st = questionStates[q.id]
                  const isAnswered = st?.answer != null && st.answer !== ''
                  const flagged = st?.flagged
                  return (
                    <div key={q.id} className="relative">
                      {flagged && (
                        <span className="absolute -right-1.5 -top-2.5 z-10" aria-hidden>
                          <FlagGlyph />
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={() => jumpTo(sIdx, qIdx)}
                        aria-label={t('testEngine.goToQuestion', { number: qIdx + 1 })}
                        className={cn(
                          'flex h-9 w-9 items-center justify-center text-[17px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bb-blue',
                          isAnswered
                            ? 'bg-bb-blue text-white'
                            : 'border border-dashed border-bb-ink bg-white text-bb-blue hover:bg-neutral-100'
                        )}
                      >
                        {qIdx + 1}
                      </button>
                    </div>
                  )
                })}
              </div>
            </section>
          )
        })}

        <div className="mt-12 flex justify-center">
          <button
            type="button"
            onClick={onSubmit}
            className="rounded-full bg-bb-blue px-10 py-3 text-[17px] font-bold text-white transition-colors hover:bg-bb-blueDark focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bb-blue focus-visible:ring-offset-2"
          >
            {t('testEngine.reviewScreen.submit')}
          </button>
        </div>
      </div>
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
