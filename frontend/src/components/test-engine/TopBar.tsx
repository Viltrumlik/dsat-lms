// Domain: Test Engine
// Description: Bluebook header — section/module title + Directions toggle on
//   the left, the timer in the centre, Highlights & Notes + More on the right,
//   closed by the perforated rule.
'use client'

import { Calculator, ChevronDown, ChevronUp, Highlighter, StickyNote } from 'lucide-react'
import { useSessionStore } from '@/lib/stores/sessionStore'
import { useT } from '@/lib/i18n/I18nProvider'
import { cn } from '@/lib/utils/cn'
import { TimerDisplay } from './TimerDisplay'
import { MoreMenu } from './MoreMenu'
import { sectionLabel } from './examLabels'

interface TopBarProps {
  onTimeUp: () => void
  onPause: () => void
  directionsOpen: boolean
  onToggleDirections: () => void
}

export function TopBar({ onTimeUp, onPause, directionsOpen, onToggleDirections }: TopBarProps) {
  const t = useT()
  const sections = useSessionStore((s) => s.sections)
  const sectionIndex = useSessionStore((s) => s.currentSectionIndex)
  const notesOpen = useSessionStore((s) => s.notesOpen)
  const setNotesOpen = useSessionStore((s) => s.setNotesOpen)
  const calculatorOpen = useSessionStore((s) => s.calculatorOpen)
  const setCalculatorOpen = useSessionStore((s) => s.setCalculatorOpen)

  const title = sectionLabel(sections, sectionIndex, t)

  return (
    <header className="shrink-0 bg-bb-chrome">
      <div className="flex items-start justify-between gap-4 px-6 pb-2 pt-3">
        {/* Left — title + directions */}
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-[22px] font-bold leading-7 text-bb-ink">{title}</h1>
          <button
            type="button"
            onClick={onToggleDirections}
            aria-expanded={directionsOpen}
            className="mt-0.5 flex items-center gap-1 text-[17px] font-medium text-bb-ink hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bb-blue"
          >
            {t('testEngine.directions.label')}
            {directionsOpen ? (
              <ChevronUp className="h-4 w-4" />
            ) : (
              <ChevronDown className="h-4 w-4" />
            )}
          </button>
        </div>

        {/* Centre — timer */}
        <div className="shrink-0 pt-0.5">
          <TimerDisplay onTimeUp={onTimeUp} />
        </div>

        {/* Right — calculator, annotations + more */}
        <div className="flex flex-1 items-start justify-end gap-7">
          <button
            type="button"
            onClick={() => setCalculatorOpen(!calculatorOpen)}
            aria-pressed={calculatorOpen}
            className={cn(
              'flex flex-col items-center gap-0.5 text-bb-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bb-blue',
              calculatorOpen && 'underline underline-offset-4'
            )}
          >
            <Calculator className="h-5 w-5" />
            <span className="whitespace-nowrap text-[13px] font-semibold">
              {t('testEngine.calculator.label')}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setNotesOpen(!notesOpen)}
            aria-pressed={notesOpen}
            className={cn(
              'flex flex-col items-center gap-0.5 text-bb-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bb-blue',
              notesOpen && 'underline underline-offset-4'
            )}
          >
            <span className="flex items-center gap-1">
              <Highlighter className="h-5 w-5" />
              <StickyNote className="h-5 w-5" />
            </span>
            <span className="whitespace-nowrap text-[13px] font-semibold">
              {t('testEngine.highlightsNotes')}
            </span>
          </button>

          <MoreMenu onPause={onPause} />
        </div>
      </div>
      <div className="bb-ticks" aria-hidden />
    </header>
  )
}
