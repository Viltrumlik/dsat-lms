// Domain: Admin (content studio)
// Description: Tracks whichever authoring field currently has focus so the
//   toolbar can splice a snippet at that field's caret — without the toolbar
//   needing to know which field it is.
'use client'

import * as React from 'react'

type Field = HTMLTextAreaElement | HTMLInputElement

export interface FieldRegistration {
  onFocus: (e: React.FocusEvent<Field>) => void
}

export interface FieldInsert {
  /** Spread onto any input/textarea that the toolbar should be able to write into. */
  register: (setValue: (next: string) => void) => FieldRegistration
  /** Splice `snippet` at the active field's caret; no-op when nothing is focused. */
  insert: (snippet: string, cursorOffset: number) => void
  /** True once a field has been focused — lets the UI hint before that. */
  hasTarget: boolean
}

export function useFieldInsert(): FieldInsert {
  const activeRef = React.useRef<{ el: Field; setValue: (next: string) => void } | null>(null)
  const [hasTarget, setHasTarget] = React.useState(false)

  const register = React.useCallback(
    (setValue: (next: string) => void): FieldRegistration => ({
      onFocus: (e) => {
        activeRef.current = { el: e.currentTarget, setValue }
        setHasTarget(true)
      },
    }),
    []
  )

  const insert = React.useCallback((snippet: string, cursorOffset: number) => {
    const active = activeRef.current
    if (!active) return
    const { el, setValue } = active

    // Read from the DOM rather than React state: the element holds the current
    // value even when a state update from a previous insert is still batched.
    const start = el.selectionStart ?? el.value.length
    const end = el.selectionEnd ?? el.value.length
    setValue(el.value.slice(0, start) + snippet + el.value.slice(end))

    // Restore focus + caret after React has flushed and repainted; doing it
    // synchronously would run setSelectionRange against the pre-update DOM.
    const caret = start + cursorOffset
    requestAnimationFrame(() => {
      el.focus()
      el.setSelectionRange(caret, caret)
    })
  }, [])

  return { register, insert, hasTarget }
}
