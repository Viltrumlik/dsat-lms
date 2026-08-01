// Domain: Test Engine
// Description: Bluebook countdown — large clock over a "Hide" pill. When
//   hidden, only a clock icon remains (matches the official app).
// State: server-authoritative; the client only counts down for display.
'use client'

import { Clock } from 'lucide-react'
import { useTimer } from '@/lib/hooks/useTimer'
import { useSessionStore } from '@/lib/stores/sessionStore'
import { useT } from '@/lib/i18n/I18nProvider'
import { cn } from '@/lib/utils/cn'

export function TimerDisplay({ onTimeUp }: { onTimeUp?: () => void }) {
  const t = useT()
  const { formatted, isWarning, isDanger, timeRemaining } = useTimer({ onTimeUp })
  const hidden = useSessionStore((s) => s.timerHidden)
  const toggleHidden = useSessionStore((s) => s.toggleTimerHidden)

  if (timeRemaining === null) {
    return (
      <span className="flex items-center gap-1.5 text-lg font-medium text-bb-ink">
        <Clock className="h-5 w-5" /> {t('testEngine.timerUntimed')}
      </span>
    )
  }

  return (
    <div className="flex flex-col items-center gap-1">
      {hidden ? (
        <Clock className="h-7 w-7 text-bb-ink" aria-hidden />
      ) : (
        <span
          role="timer"
          aria-live={isDanger ? 'assertive' : 'off'}
          className={cn(
            'text-[28px] font-medium leading-8 tabular-nums text-bb-ink',
            isWarning && !isDanger && 'text-[#9A6200]',
            isDanger && 'text-bb-flag'
          )}
        >
          {formatted}
        </span>
      )}
      <button
        type="button"
        onClick={toggleHidden}
        aria-pressed={hidden}
        className="rounded-full border border-bb-ink px-4 py-0.5 text-sm font-medium text-bb-ink transition-colors hover:bg-bb-ink hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bb-blue"
      >
        {hidden ? t('testEngine.showTimer') : t('testEngine.hideTimer')}
      </button>
    </div>
  )
}
