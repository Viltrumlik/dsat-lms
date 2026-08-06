// Domain: Test Engine
// Description: The Directions drop-down — a white sheet anchored under the
//   header's "Directions" control, closed by the yellow Close button.
'use client'

import * as React from 'react'
import { useSessionStore } from '@/lib/stores/sessionStore'
import { useT } from '@/lib/i18n/I18nProvider'
import { directionsKey } from './examLabels'

export function DirectionsPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useT()
  const section = useSessionStore((s) => s.sections[s.currentSectionIndex])

  React.useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  const body = t(directionsKey(section?.module))
  const paragraphs = body.split('\n\n')

  return (
    <div className="absolute inset-0 z-30" role="dialog" aria-modal="true" aria-label={t('testEngine.directions.label')}>
      {/* Dimmed backdrop — clicking it closes, like the app */}
      <button
        type="button"
        aria-hidden
        tabIndex={-1}
        onClick={onClose}
        className="absolute inset-0 cursor-default bg-black/45"
      />
      <div className="relative mx-3 w-[min(64%,900px)]">
        {/* Caret pointing back up at the Directions control */}
        <div className="ml-8 h-0 w-0 border-x-[14px] border-b-[14px] border-x-transparent border-b-white" />
        <div className="flex max-h-[calc(100dvh-220px)] flex-col rounded-sm bg-white shadow-2xl">
          <div className="overflow-y-auto px-10 py-8">
            <div className="bb-prose">
              {paragraphs.map((p, i) => (
                <p key={i}>{p}</p>
              ))}
            </div>
          </div>
          <div className="flex justify-end px-8 pb-7 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-full bg-bb-yellow px-8 py-2.5 text-[17px] font-bold text-bb-ink shadow-sm transition-colors hover:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bb-ink"
            >
              {t('testEngine.directions.close')}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
