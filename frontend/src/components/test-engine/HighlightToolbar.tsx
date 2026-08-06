// Domain: Test Engine
// Description: The floating pill that appears over a text selection — three
//   highlight colours, an underline toggle, delete, and "add note".
'use client'

import * as React from 'react'
import { ChevronDown, Trash2 } from 'lucide-react'
import { useT } from '@/lib/i18n/I18nProvider'
import { cn } from '@/lib/utils/cn'
import type { HighlightColor } from '@/types'

const COLORS: Array<{ value: HighlightColor; swatch: string }> = [
  { value: 'yellow', swatch: '#F9DA4A' },
  { value: 'blue', swatch: '#E9F5FE' },
  { value: 'pink', swatch: '#FBE6F7' },
]

export interface ToolbarPosition {
  top: number
  left: number
}

interface HighlightToolbarProps {
  position: ToolbarPosition
  /** Set when editing an existing highlight (enables delete + note). */
  activeColor: HighlightColor | null
  underline: boolean
  canDelete: boolean
  onColor: (color: HighlightColor) => void
  onToggleUnderline: () => void
  onDelete: () => void
  onAddNote: () => void
}

export function HighlightToolbar({
  position,
  activeColor,
  underline,
  canDelete,
  onColor,
  onToggleUnderline,
  onDelete,
  onAddNote,
}: HighlightToolbarProps) {
  const t = useT()

  return (
    <div
      role="toolbar"
      aria-label={t('testEngine.annotate.toolbar')}
      // Stop the mousedown from clearing the selection before we read it.
      onMouseDown={(e) => e.preventDefault()}
      style={{ top: position.top, left: position.left }}
      className="fixed z-40 flex -translate-x-1/2 -translate-y-full items-center gap-2 rounded-full border border-neutral-300 bg-white px-3 py-2 shadow-lg"
    >
      {COLORS.map((c) => (
        <button
          key={c.value}
          type="button"
          onClick={() => onColor(c.value)}
          aria-label={t(`testEngine.annotate.color.${c.value}`)}
          aria-pressed={activeColor === c.value}
          className={cn(
            'h-8 w-8 rounded-full border border-neutral-400 transition-shadow',
            activeColor === c.value && 'ring-2 ring-bb-ink ring-offset-1'
          )}
          style={{ backgroundColor: c.swatch }}
        />
      ))}

      <button
        type="button"
        onClick={onToggleUnderline}
        aria-pressed={underline}
        aria-label={t('testEngine.annotate.underline')}
        className={cn(
          'flex items-center gap-0.5 rounded px-1.5 py-1 text-bb-ink transition-colors hover:bg-neutral-100',
          underline && 'bg-neutral-200'
        )}
      >
        <span className="text-lg font-medium leading-none underline decoration-2 underline-offset-2">
          U
        </span>
        <ChevronDown className="h-3.5 w-3.5" />
      </button>

      <button
        type="button"
        onClick={onDelete}
        disabled={!canDelete}
        aria-label={t('testEngine.annotate.delete')}
        className="flex h-8 w-8 items-center justify-center rounded-full border border-neutral-400 text-bb-ink transition-colors hover:bg-neutral-100 disabled:opacity-35"
      >
        <Trash2 className="h-4 w-4" />
      </button>

      <span className="h-6 w-px bg-neutral-300" aria-hidden />

      <button
        type="button"
        onClick={onAddNote}
        aria-label={t('testEngine.annotate.addNote')}
        className="flex h-8 w-8 items-center justify-center rounded-full border border-neutral-400 transition-colors hover:bg-neutral-100"
      >
        <svg viewBox="0 0 24 24" className="pointer-events-none h-[18px] w-[18px]" aria-hidden>
          <path
            d="M4 3h11l5 5v13H4V3Z"
            fill="#F9DA4A"
            stroke="#1E1E1E"
            strokeWidth="1.5"
            strokeLinejoin="round"
          />
          <path d="M9 12h6M12 9v6" stroke="#1E1E1E" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </button>
    </div>
  )
}
