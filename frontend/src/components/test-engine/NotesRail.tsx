// Domain: Test Engine
// Description: The Highlights & Notes column — one yellow card per annotated
//   passage, each with a free-text note that auto-saves with the session.
'use client'

import * as React from 'react'
import { ChevronLeft, Trash2 } from 'lucide-react'
import { useSessionStore } from '@/lib/stores/sessionStore'
import { useT } from '@/lib/i18n/I18nProvider'
import type { Annotation } from '@/types'

interface NotesRailProps {
  questionId: string
  annotations: Annotation[]
}

export function NotesRail({ questionId, annotations }: NotesRailProps) {
  const t = useT()
  const setNote = useSessionStore((s) => s.updateAnnotation)
  const removeAnnotation = useSessionStore((s) => s.removeAnnotation)
  const setNotesOpen = useSessionStore((s) => s.setNotesOpen)

  return (
    <aside
      className="relative flex w-[280px] shrink-0 flex-col overflow-y-auto bg-bb-rail px-4 py-4"
      aria-label={t('testEngine.highlightsNotes')}
    >
      {annotations.length === 0 ? (
        <p className="px-1 text-sm text-neutral-600">{t('testEngine.annotate.empty')}</p>
      ) : (
        <ul className="space-y-3">
          {annotations.map((a) => (
            <li
              key={a.id}
              className="overflow-hidden rounded-md border-2 border-bb-ink bg-white shadow-sm"
            >
              <div className="flex items-start gap-2 bg-bb-yellow px-3 py-2">
                <p className="min-w-0 flex-1 break-words text-[13px] font-bold text-bb-ink">
                  {a.text}
                </p>
                <button
                  type="button"
                  onClick={() => removeAnnotation(questionId, a.id)}
                  aria-label={t('testEngine.annotate.deleteNote')}
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white text-bb-ink transition-colors hover:bg-neutral-100"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
              <textarea
                data-note-for={a.id}
                value={a.note}
                onChange={(e) => setNote(questionId, a.id, { note: e.target.value })}
                placeholder={t('testEngine.annotate.notePlaceholder')}
                rows={2}
                className="w-full resize-y bg-white px-3 py-2 text-sm text-bb-ink placeholder:text-neutral-500 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-bb-blue"
              />
            </li>
          ))}
        </ul>
      )}

      <button
        type="button"
        onClick={() => setNotesOpen(false)}
        aria-label={t('testEngine.annotate.collapse')}
        className="sticky top-full mt-auto flex h-9 w-9 items-center justify-center self-start rounded-full bg-neutral-500 text-white transition-colors hover:bg-neutral-600"
      >
        <ChevronLeft className="h-5 w-5" />
      </button>
    </aside>
  )
}
