// Domain: Test Engine
// Description: Bluebook answer choices — bordered cards with a lettered badge,
//   plus the eliminator column (struck-through letters) shown when ABC mode is
//   on. Selecting an eliminated choice restores it first, as in the real app.
//
//   On a DRILL (session feedback_mode = instant) the choice is marked the moment
//   it is chosen: the pick turns green or red and the key is shown alongside it.
//   `verdict` is null on a real paper and the component looks exactly as before —
//   the marking is driven entirely by what the server sent back, never guessed
//   client-side, because the client is never told the key on a paper.
'use client'

import { useSessionStore } from '@/lib/stores/sessionStore'
import { cn } from '@/lib/utils/cn'
import { useT } from '@/lib/i18n/I18nProvider'
import { MarkdownMath } from './MarkdownMath'
import type { ChoiceLabel, QuestionChoice } from '@/types'

interface ChoiceListProps {
  choices: QuestionChoice[]
  value: string | null
  crossedOut: ChoiceLabel[]
  onSelect: (label: string) => void
  onToggleCrossOut: (label: ChoiceLabel) => void
  /** Server verdict for this question, on instant-feedback sessions only. */
  verdict?: { isCorrect: boolean; correctAnswer: string } | null
}

export function ChoiceList({
  choices,
  value,
  crossedOut,
  onSelect,
  onToggleCrossOut,
  verdict = null,
}: ChoiceListProps) {
  const t = useT()
  const eliminatorOn = useSessionStore((s) => s.eliminatorOn)
  const ordered = choices.slice().sort((a, b) => a.sortOrder - b.sortOrder)
  // Once marked, the answer stands — re-picking would make the feedback a
  // guessing game rather than a check.
  const marked = verdict !== null

  return (
    <div className="space-y-3" role="radiogroup" aria-label={t('testEngine.answerChoices')}>
      {ordered.map((choice) => {
        const label = choice.label
        const selected = value === label
        const struck = crossedOut.includes(label)
        const isKey = marked && verdict.correctAnswer === label
        const isWrongPick = marked && selected && !verdict.isCorrect

        return (
          <div key={label} className="flex items-center gap-3">
            <button
              type="button"
              role="radio"
              aria-checked={selected}
              disabled={marked}
              onClick={() => {
                if (struck) onToggleCrossOut(label)
                onSelect(label)
              }}
              className={cn(
                'flex flex-1 items-start gap-4 rounded-[10px] bg-white text-left transition-colors',
                selected && !marked
                  ? 'border-[3px] border-bb-blue px-[14px] py-[10px]'
                  : 'border border-bb-choice px-4 py-3',
                !marked && !selected && 'hover:bg-neutral-50',
                isKey && 'border-[3px] border-bb-right bg-bb-rightBg px-[14px] py-[10px]',
                isWrongPick && 'border-[3px] border-bb-wrong bg-bb-wrongBg px-[14px] py-[10px]',
                struck && 'opacity-60'
              )}
            >
              <span
                className={cn(
                  'mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-[15px] font-semibold',
                  selected && !marked && 'border-bb-blue bg-bb-blue text-white',
                  !selected && !marked && 'border-bb-choice text-bb-ink',
                  marked && !isKey && !isWrongPick && 'border-bb-choice text-bb-ink',
                  isKey && 'border-bb-right bg-bb-right text-white',
                  isWrongPick && 'border-bb-wrong bg-bb-wrong text-white'
                )}
              >
                {label}
              </span>
              <span className={cn('flex-1', struck && 'line-through decoration-bb-ink')}>
                <MarkdownMath content={choice.text} className="bb-prose [&_p]:m-0" />
              </span>
              {isKey && (
                <span className="mt-1 shrink-0 text-[13px] font-bold text-bb-right">
                  {t('testEngine.feedback.correct')}
                </span>
              )}
              {isWrongPick && (
                <span className="mt-1 shrink-0 text-[13px] font-bold text-bb-wrong">
                  {t('testEngine.feedback.yourAnswer')}
                </span>
              )}
            </button>

            {eliminatorOn && !marked && (
              <button
                type="button"
                onClick={() => onToggleCrossOut(label)}
                aria-pressed={struck}
                aria-label={
                  struck ? t('testEngine.restore', { label }) : t('testEngine.crossOut', { label })
                }
                title={struck ? t('testEngine.undoCrossOut') : t('testEngine.crossOutTitle')}
                className="flex h-8 w-9 shrink-0 items-center justify-center rounded-full text-bb-ink transition-colors hover:bg-neutral-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bb-blue"
              >
                {struck ? (
                  <span className="text-[13px] font-semibold underline underline-offset-2">
                    {t('testEngine.undoShort')}
                  </span>
                ) : (
                  <EliminatorGlyph label={label} />
                )}
              </button>
            )}
          </div>
        )
      })}
    </div>
  )
}

/** A circled letter with a line struck through it. */
function EliminatorGlyph({ label }: { label: string }) {
  return (
    <svg viewBox="0 0 26 26" className="pointer-events-none h-[26px] w-[26px]" aria-hidden>
      <circle cx="13" cy="13" r="9.5" fill="none" stroke="currentColor" strokeWidth="1.4" />
      <text
        x="13"
        y="17.5"
        textAnchor="middle"
        fontSize="11"
        fontWeight="600"
        fontFamily="system-ui, sans-serif"
        fill="currentColor"
      >
        {label}
      </text>
      <line
        x1="1.5"
        y1="13"
        x2="24.5"
        y2="13"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  )
}
