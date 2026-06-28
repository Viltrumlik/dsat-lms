// Domain: Test Engine
// Description: MCQ choices with select + cross-out (elimination) per option.
'use client'

import { Strikethrough } from 'lucide-react'
import { cn } from '@/lib/utils/cn'
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
  const ordered = choices.slice().sort((a, b) => a.sortOrder - b.sortOrder)

  return (
    <div className="space-y-3" role="radiogroup" aria-label="Answer choices">
      {ordered.map((choice) => {
        const label = choice.label
        const selected = value === label
        const struck = crossedOut.includes(label)
        return (
          <div key={label} className="flex items-stretch gap-2">
            <button
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => onSelect(label)}
              className={cn(
                'flex flex-1 items-start gap-3 rounded-lg border-2 p-3 text-left transition-colors',
                selected
                  ? 'border-primary bg-primary-50 dark:bg-primary-800/30'
                  : 'border-border hover:border-primary-300 hover:bg-muted/50',
                struck && 'opacity-40'
              )}
            >
              <span
                className={cn(
                  'flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-sm font-semibold',
                  selected
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-border text-foreground'
                )}
              >
                {label}
              </span>
              <span className={cn('flex-1 pt-0.5', struck && 'line-through')}>
                <MarkdownMath content={choice.text} className="[&_p]:m-0" />
              </span>
            </button>
            <button
              type="button"
              onClick={() => onToggleCrossOut(label)}
              aria-label={struck ? `Restore choice ${label}` : `Cross out choice ${label}`}
              aria-pressed={struck}
              title={struck ? 'Undo cross-out' : 'Cross out'}
              className={cn(
                'flex w-11 shrink-0 items-center justify-center rounded-lg border transition-colors',
                struck
                  ? 'border-foreground bg-foreground/5 text-foreground'
                  : 'border-border text-muted-foreground hover:bg-muted'
              )}
            >
              <Strikethrough className="h-4 w-4" />
            </button>
          </div>
        )
      })}
    </div>
  )
}
