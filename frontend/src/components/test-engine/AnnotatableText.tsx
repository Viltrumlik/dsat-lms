// Domain: Test Engine
// Description: Wraps a block of exam prose (passage or stem) so the student can
//   highlight it and attach notes, exactly like Bluebook's Highlights & Notes.
// State: annotations live on the question in sessionStore → client_session_data.
'use client'

import * as React from 'react'
import { useSessionStore } from '@/lib/stores/sessionStore'
import {
  annotationId,
  applyHighlights,
  getSelectionRange,
  getSelectionRect,
  overlaps,
} from '@/lib/utils/highlight'
import { cn } from '@/lib/utils/cn'
import { HighlightToolbar, type ToolbarPosition } from './HighlightToolbar'
import type { Annotation, AnnotationTarget, HighlightColor } from '@/types'

interface AnnotatableTextProps {
  questionId: string
  target: AnnotationTarget
  annotations: Annotation[]
  /** Changing this remounts the content so stale highlight spans are dropped. */
  contentKey: string
  className?: string
  children: React.ReactNode
}

type Draft =
  | { kind: 'selection'; start: number; end: number; text: string }
  | { kind: 'existing'; annotation: Annotation }

// Approximate footprint of the floating toolbar, used to keep it on screen.
const TOOLBAR_WIDTH = 340
const TOOLBAR_HEIGHT = 56

export function AnnotatableText({
  questionId,
  target,
  annotations,
  contentKey,
  className,
  children,
}: AnnotatableTextProps) {
  const addAnnotation = useSessionStore((s) => s.addAnnotation)
  const updateAnnotation = useSessionStore((s) => s.updateAnnotation)
  const removeAnnotation = useSessionStore((s) => s.removeAnnotation)
  const setNotesOpen = useSessionStore((s) => s.setNotesOpen)

  const containerRef = React.useRef<HTMLDivElement>(null)
  const [draft, setDraft] = React.useState<Draft | null>(null)
  const [toolbarAt, setToolbarAt] = React.useState<ToolbarPosition | null>(null)

  const mine = React.useMemo(
    () => annotations.filter((a) => a.target === target),
    [annotations, target]
  )

  // Re-paint highlights whenever the set changes or the content remounts.
  React.useLayoutEffect(() => {
    const el = containerRef.current
    if (!el) return
    const activeId = draft?.kind === 'existing' ? draft.annotation.id : null
    applyHighlights(el, mine, activeId)
  }, [mine, contentKey, draft])

  const dismiss = React.useCallback(() => {
    setDraft(null)
    setToolbarAt(null)
  }, [])

  // Clicking outside the pane, or pressing Escape, dismisses the toolbar.
  React.useEffect(() => {
    if (!draft) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') dismiss()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [draft, dismiss])

  const openToolbarAt = (rect: DOMRect | null) => {
    if (!rect) return
    // Keep the pill fully on screen — selections near an edge would otherwise
    // push half of it out of view (it is centred on `left`).
    const halfWidth = TOOLBAR_WIDTH / 2
    const left = Math.min(
      window.innerWidth - halfWidth - 8,
      Math.max(halfWidth + 8, rect.left + rect.width / 2)
    )
    setToolbarAt({ top: Math.max(TOOLBAR_HEIGHT + 8, rect.top - 10), left })
  }

  const handleMouseUp = () => {
    const el = containerRef.current
    if (!el) return

    // Clicking an existing highlight re-opens it for editing.
    const sel = window.getSelection()
    if (sel && sel.isCollapsed) {
      const node = sel.anchorNode
      const mark = (node instanceof Element ? node : node?.parentElement)?.closest?.(
        'mark.bb-hl'
      ) as HTMLElement | null
      const id = mark?.dataset.annotationId
      const existing = id ? mine.find((a) => a.id === id) : undefined
      if (existing && mark) {
        setDraft({ kind: 'existing', annotation: existing })
        openToolbarAt(mark.getBoundingClientRect())
        return
      }
      dismiss()
      return
    }

    const range = getSelectionRange(el)
    if (!range) {
      dismiss()
      return
    }
    setDraft({ kind: 'selection', start: range.start, end: range.end, text: range.text })
    openToolbarAt(getSelectionRect())
  }

  const currentAnnotation = draft?.kind === 'existing' ? draft.annotation : null

  const commit = (color: HighlightColor, underline?: boolean) => {
    if (!draft) return
    if (draft.kind === 'existing') {
      updateAnnotation(questionId, draft.annotation.id, {
        color,
        underline: underline ?? draft.annotation.underline,
      })
      setDraft({
        kind: 'existing',
        annotation: {
          ...draft.annotation,
          color,
          underline: underline ?? draft.annotation.underline,
        },
      })
      return
    }
    // Replace any highlights the new selection covers, as the app does.
    for (const a of mine) {
      if (overlaps(a, draft)) removeAnnotation(questionId, a.id)
    }
    const annotation: Annotation = {
      id: annotationId(),
      target,
      start: draft.start,
      end: draft.end,
      text: draft.text,
      color,
      underline: underline ?? false,
      note: '',
    }
    addAnnotation(questionId, annotation)
    setDraft({ kind: 'existing', annotation })
    window.getSelection()?.removeAllRanges()
  }

  const handleAddNote = () => {
    let annotation = currentAnnotation
    if (!annotation && draft?.kind === 'selection') {
      annotation = {
        id: annotationId(),
        target,
        start: draft.start,
        end: draft.end,
        text: draft.text,
        color: 'yellow',
        underline: false,
        note: '',
      }
      for (const a of mine) {
        if (overlaps(a, draft)) removeAnnotation(questionId, a.id)
      }
      addAnnotation(questionId, annotation)
      window.getSelection()?.removeAllRanges()
    }
    if (!annotation) return
    setNotesOpen(true)
    dismiss()
    // Let the rail mount before focusing its textarea.
    requestAnimationFrame(() => {
      const field = document.querySelector<HTMLTextAreaElement>(
        `[data-note-for="${annotation!.id}"]`
      )
      field?.focus()
    })
  }

  const handleDelete = () => {
    if (currentAnnotation) removeAnnotation(questionId, currentAnnotation.id)
    dismiss()
  }

  return (
    <>
      <div
        ref={containerRef}
        key={contentKey}
        onMouseUp={handleMouseUp}
        className={cn('bb-selectable', className)}
      >
        {children}
      </div>

      {draft && toolbarAt && (
        <HighlightToolbar
          position={toolbarAt}
          activeColor={currentAnnotation?.color ?? null}
          underline={currentAnnotation?.underline ?? false}
          canDelete={Boolean(currentAnnotation)}
          onColor={(color) => commit(color)}
          onToggleUnderline={() => {
            const color = currentAnnotation?.color ?? 'yellow'
            commit(color, !(currentAnnotation?.underline ?? false))
          }}
          onDelete={handleDelete}
          onAddNote={handleAddNote}
        />
      )}
    </>
  )
}
