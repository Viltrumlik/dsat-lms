// Domain: Test Engine
// Description: Bluebook answer choices — bordered cards with a lettered badge,
//   plus the eliminator column (struck-through letters) shown when ABC mode is
//   on. Selecting an eliminated choice restores it first, as in the real app.
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
}

export function ChoiceList({
  choices,
  value,
  crossedOut,
  onSelect,
  onToggleCrossOut,
}: ChoiceListProps) {
  const t = useT()
  const eliminatorOn = useSessionStore((s) => s.eliminatorOn)
  const ordered = choices.slice().sort((a, b) => a.sortOrder - b.sortOrder)

  return (
    <div className="space-y-3" role="radiogroup" aria-label={t('testEngine.answerChoices')}>
      {ordered.map((choice) => {
        const label = choice.label
        const selected = value === label
        const struck = crossedOut.includes(label)

        return (
          <div key={label} className="flex items-center gap-3">
            <button
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => {
                if (struck) onToggleCrossOut(label)
                onSelect(label)
              }}
              className={cn(
                'flex flex-1 items-start gap-4 rounded-[10px] bg-white text-left transition-colors',
                selected
                  ? 'border-[3px] border-bb-blue px-[14px] py-[10px]'
                  : 'border border-bb-choice px-4 py-3 hover:bg-neutral-50',
                struck && 'opacity-60'
              )}
            >
              <span
                className={cn(
                  'mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-[15px] font-semibold',
                  selected ? 'border-bb-blue bg-bb-blue text-white' : 'border-bb-choice text-bb-ink'
                )}
              >
                {label}
              </span>
              <span className={cn('flex-1', struck && 'line-through decoration-bb-ink')}>
                <MarkdownMath content={choice.text} className="bb-prose [&_p]:m-0" />
              </span>
            </button>

            {eliminatorOn && (
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
