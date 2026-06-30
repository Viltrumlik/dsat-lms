// Domain: Test Engine
// Description: Countdown display (server-authoritative; client display only).
'use client'

import { Clock } from 'lucide-react'
import { useTimer } from '@/lib/hooks/useTimer'
import { useT } from '@/lib/i18n/I18nProvider'
import { cn } from '@/lib/utils/cn'

export function TimerDisplay({ onTimeUp }: { onTimeUp?: () => void }) {
  const t = useT()
  const { formatted, isWarning, isDanger, timeRemaining } = useTimer({ onTimeUp })

  if (timeRemaining === null) {
    return (
      <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
        <Clock className="h-4 w-4" /> {t('testEngine.timerUntimed')}
      </span>
    )
  }

  return (
    <span
      role="timer"
      aria-live={isDanger ? 'assertive' : 'off'}
      className={cn(
        'flex items-center gap-1.5 rounded-md px-2.5 py-1 font-mono text-sm font-semibold tabular-nums transition-colors',
        isDanger
          ? 'bg-error-light text-error-dark'
          : isWarning
            ? 'bg-warning-light text-warning-dark'
            : 'bg-muted text-foreground'
      )}
    >
      <Clock className="h-4 w-4" />
      {formatted}
    </span>
  )
}
