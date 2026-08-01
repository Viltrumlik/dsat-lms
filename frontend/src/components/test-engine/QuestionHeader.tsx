// Domain: Test Engine
// Description: The strip above every question — number chip, "Mark for Review"
//   bookmark, and the ABC answer-eliminator toggle — over a perforated rule.
'use client'

import { Bookmark } from 'lucide-react'
import { useSessionStore } from '@/lib/stores/sessionStore'
import { useT } from '@/lib/i18n/I18nProvider'
import { cn } from '@/lib/utils/cn'

interface QuestionHeaderProps {
  number: number
  flagged: boolean
  onToggleFlag: () => void
  /** Hidden for grid-in questions, which have nothing to eliminate. */
  showEliminator: boolean
}

export function QuestionHeader({
  number,
  flagged,
  onToggleFlag,
  showEliminator,
}: QuestionHeaderProps) {
  const t = useT()
  const eliminatorOn = useSessionStore((s) => s.eliminatorOn)
  const toggleEliminator = useSessionStore((s) => s.toggleEliminator)

  return (
    <div className="mb-4">
      <div className="flex items-center bg-bb-strip">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center bg-bb-ink text-[19px] font-bold text-white">
          {number}
        </span>

        <button
          type="button"
          onClick={onToggleFlag}
          aria-pressed={flagged}
          className="ml-4 flex items-center gap-2 py-1.5 text-[17px] text-bb-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bb-blue"
        >
          <Bookmark
            className={cn('h-5 w-5', flagged ? 'fill-bb-flag text-bb-flag' : 'text-bb-ink')}
          />
          <span className={cn(flagged && 'font-bold underline underline-offset-2')}>
            {t('testEngine.markForReview')}
          </span>
        </button>

        {showEliminator && (
          <button
            type="button"
            onClick={toggleEliminator}
            aria-pressed={eliminatorOn}
            aria-label={t('testEngine.eliminatorAria')}
            title={t('testEngine.eliminatorAria')}
            className={cn(
              'ml-auto mr-1 flex h-8 w-9 items-center justify-center rounded border-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bb-blue',
              eliminatorOn
                ? 'border-bb-blue bg-bb-blue text-white'
                : 'border-bb-ink bg-white text-bb-ink'
            )}
          >
            <AbcIcon />
          </button>
        )}
      </div>
      <div className="bb-ticks" aria-hidden />
    </div>
  )
}

/** "ABC" with a strike through it — the eliminator glyph. */
function AbcIcon() {
  return (
    <svg viewBox="0 0 34 18" className="pointer-events-none h-4 w-7" aria-hidden>
      <text
        x="1"
        y="14"
        fontSize="13"
        fontWeight="700"
        fontFamily="system-ui, sans-serif"
        fill="currentColor"
      >
        ABC
      </text>
      <line
        x1="1"
        y1="14"
        x2="32"
        y2="2"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  )
}
