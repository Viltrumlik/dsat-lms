// Domain: Test Engine
// Description: The two full-screen surfaces for an invigilated paper — the
//   Begin screen that enters it, and the block that goes up when the student
//   leaves.
//
// Both exist because the browser only grants fullscreen from a user gesture.
// The Begin screen turns the unavoidable first click into the gesture; the
// block turns the student's way back in into another one. Neither is decoration.
'use client'

import { Expand, Maximize2, ShieldAlert } from 'lucide-react'
import { useT } from '@/lib/i18n/I18nProvider'
import { Button } from '@/components/ui/button'

/** Shown before the paper opens. The click here is what enters full screen. */
export function FullscreenStart({
  examTitle,
  sectionCount,
  questionCount,
  supported,
  onBegin,
}: {
  examTitle: string
  sectionCount: number
  questionCount: number
  supported: boolean
  onBegin: () => void
}) {
  const t = useT()
  return (
    <div className="flex h-[100dvh] flex-col items-center justify-center bg-white px-6 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-bb-chrome">
        <Expand className="h-8 w-8 text-bb-ink" />
      </div>
      <h1 className="mt-6 text-[28px] font-bold text-bb-ink">{examTitle}</h1>
      <p className="mt-1 font-exam text-[19px] text-neutral-700">
        {t('testEngine.fullscreen.subtitle', {
          sections: sectionCount,
          questions: questionCount,
        })}
      </p>

      <ul className="mt-7 max-w-md space-y-2 text-left font-exam text-[17px] text-bb-ink">
        <li>· {t('testEngine.fullscreen.ruleFullscreen')}</li>
        <li>· {t('testEngine.fullscreen.ruleTimer')}</li>
        <li>· {t('testEngine.fullscreen.ruleBreak')}</li>
      </ul>

      {!supported && (
        <p className="mt-6 max-w-md text-[15px] text-bb-flag">
          {t('testEngine.fullscreen.unsupported')}
        </p>
      )}

      <Button
        className="mt-9 rounded-full bg-bb-blue px-12 py-3 text-[17px] font-bold text-white hover:bg-bb-blueDark"
        onClick={onBegin}
      >
        <Maximize2 className="h-4 w-4" /> {t('testEngine.fullscreen.begin')}
      </Button>
    </div>
  )
}

/** Covers the paper the moment the student leaves full screen. */
export function FullscreenBlocker({
  exits,
  onReturn,
  onSubmit,
}: {
  exits: number
  onReturn: () => void
  onSubmit: () => void
}) {
  const t = useT()
  return (
    <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-white px-6 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-bb-flag/10">
        <ShieldAlert className="h-8 w-8 text-bb-flag" />
      </div>
      <h2 className="mt-6 text-[26px] font-bold text-bb-ink">
        {t('testEngine.fullscreen.leftTitle')}
      </h2>
      <p className="mt-2 max-w-md font-exam text-[18px] text-neutral-700">
        {t('testEngine.fullscreen.leftBody')}
      </p>
      {exits > 1 && (
        <p className="mt-2 text-[15px] text-bb-flag">
          {t('testEngine.fullscreen.leftCount', { count: exits })}
        </p>
      )}
      <Button
        className="mt-8 rounded-full bg-bb-blue px-12 py-3 text-[17px] font-bold text-white hover:bg-bb-blueDark"
        onClick={onReturn}
      >
        <Maximize2 className="h-4 w-4" /> {t('testEngine.fullscreen.return')}
      </Button>
      <button
        type="button"
        onClick={onSubmit}
        className="mt-4 text-[15px] text-neutral-600 underline hover:text-bb-ink"
      >
        {t('testEngine.fullscreen.submitInstead')}
      </button>
    </div>
  )
}
