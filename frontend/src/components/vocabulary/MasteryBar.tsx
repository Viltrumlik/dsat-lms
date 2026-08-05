// Domain: Vocabulary
// Description: How much of a list or a deck has stuck.
'use client'

import { useT } from '@/lib/i18n/I18nProvider'

export function MasteryBar({ mastered, total }: { mastered: number; total: number }) {
  const t = useT()
  const pct = total > 0 ? Math.round((mastered / total) * 100) : 0
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>{t('vocab.mastered')}</span>
        <span className="tabular-nums">
          {mastered}/{total}
        </span>
      </div>
      <div
        className="h-1.5 overflow-hidden rounded-full bg-muted"
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div className="h-full rounded-full bg-success transition-all" style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}
