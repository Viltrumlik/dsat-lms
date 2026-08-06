// Domain: Public (auth)
// Description: The six-digit code box.
//
// One input, not six boxes. Six separate boxes look tidy and then fight the
// student: paste puts all six characters in the first one, autofill from the
// OS "copy code from Messages" suggestion fills only the first, and backspace
// across a boundary needs hand-written focus juggling. A single field with
// `inputMode="numeric"` and `autoComplete="one-time-code"` gets the keypad and
// the autofill for free, and cannot get any of that wrong.
'use client'

import * as React from 'react'
import { cn } from '@/lib/utils/cn'

export const CODE_LENGTH = 6

export function CodeInput({
  value,
  onChange,
  onComplete,
  disabled,
  label,
  autoFocus,
}: {
  value: string
  onChange: (value: string) => void
  /** Fired when the last digit lands — lets the form submit itself. */
  onComplete?: (value: string) => void
  disabled?: boolean
  label: string
  autoFocus?: boolean
}) {
  // Which value we last auto-submitted, NOT a "have we fired" flag. A flag
  // latches: enter a wrong code, have the parent clear the field, type the right
  // one — and the second completion never fires, because the flag was only ever
  // reset from inside this handler and the parent's clear never went through it.
  // That is the exact path a student takes after a typo.
  const firedFor = React.useRef<string | null>(null)

  React.useEffect(() => {
    if (value.length < CODE_LENGTH) firedFor.current = null
  }, [value])

  const handle = (raw: string) => {
    const digits = raw.replace(/\D/g, '').slice(0, CODE_LENGTH)
    onChange(digits)
    if (digits.length === CODE_LENGTH && firedFor.current !== digits) {
      firedFor.current = digits
      onComplete?.(digits)
    }
  }

  return (
    <input
      type="text"
      inputMode="numeric"
      autoComplete="one-time-code"
      pattern="[0-9]*"
      maxLength={CODE_LENGTH}
      aria-label={label}
      autoFocus={autoFocus}
      disabled={disabled}
      value={value}
      onChange={(e) => handle(e.target.value)}
      className={cn(
        'w-full rounded-lg border border-input bg-background px-4 py-3 text-center',
        'font-mono text-3xl tracking-[0.4em] tabular-nums',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        'disabled:cursor-not-allowed disabled:opacity-60'
      )}
      placeholder="······"
    />
  )
}
