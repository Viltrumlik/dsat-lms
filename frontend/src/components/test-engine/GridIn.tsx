// Domain: Test Engine
// Description: Student-produced response (grid-in) — Bluebook's boxed entry
//   field with a live, typeset "Answer preview" underneath.
//
//   The field does NOT report every keystroke. It used to, and on a drill (where
//   the server marks each answer as it arrives) that meant a student typing
//   "15.2" had "1" marked wrong before they reached the decimal point — the
//   answer was judged four times on its way to being written. Commit happens on
//   blur and on the explicit Check button, which is what those are for.
'use client'

import * as React from 'react'
import { useT } from '@/lib/i18n/I18nProvider'
import { MarkdownMath } from './MarkdownMath'
import { gridInLatex } from './gridInLatex'

interface GridInProps {
  value: string | null
  onChange: (value: string) => void
  /** Send the current value to the server. Blur, or the Check button. */
  onCommit?: () => void
  /** Server verdict, on instant-feedback drills only. Null on a real paper. */
  verdict?: { isCorrect: boolean; correctAnswer: string } | null
}

export function GridIn({ value, onChange, onCommit, verdict = null }: GridInProps) {
  const t = useT()
  const entered = (value ?? '').trim()
  const latex = gridInLatex(entered)
  const marked = verdict !== null

  // Same tokens the choice list marks with, so a checked grid-in and a checked
  // multiple choice read as the same thing on the same screen.
  const fieldTone = !marked
    ? 'border-bb-choice bg-white focus:border-bb-blue focus:ring-bb-blue/40'
    : verdict.isCorrect
      ? 'border-[3px] border-bb-right bg-bb-rightBg'
      : 'border-[3px] border-bb-wrong bg-bb-wrongBg'

  return (
    <div className="max-w-md space-y-3">
      <input
        id="grid-in"
        inputMode="text"
        autoComplete="off"
        aria-label={t('testEngine.yourAnswer')}
        maxLength={12}
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value)}
        onBlur={() => onCommit?.()}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            onCommit?.()
          }
        }}
        readOnly={marked}
        className={`h-12 w-56 rounded-[10px] border px-4 font-exam text-[19px] text-bb-ink focus:outline-none focus:ring-2 ${fieldTone}`}
      />

      <div className="flex min-h-[2rem] items-center gap-2 font-exam text-[17px] text-bb-ink">
        <span>{t('testEngine.answerPreview')}</span>
        {latex ? (
          // Typeset, so `3/4` previews as the fraction it will be graded as.
          <MarkdownMath content={`$${latex}$`} className="[&_p]:m-0" />
        ) : (
          <span className="font-semibold">{entered || '—'}</span>
        )}
      </div>

      {marked && !verdict.isCorrect && (
        <p className="font-exam text-[17px] text-bb-wrong">
          {t('testEngine.correctAnswerIs')}{' '}
          <span className="font-semibold">{verdict.correctAnswer}</span>
        </p>
      )}

      <p className="text-sm text-neutral-600">{t('testEngine.gridInHelp')}</p>
    </div>
  )
}
