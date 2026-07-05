// Domain: Academy (teacher)
// Description: Risk badge (green/yellow/red) + helpers to render the localized
//   "why" reasons behind a student's risk level. The reasons are built from the
//   structured signal/value/unit fields (server `message` is an EN fallback), so
//   the sentence localizes cleanly to uz.
'use client'

import { Badge } from '@/components/ui/badge'
import { useT } from '@/lib/i18n/I18nProvider'
import type { RiskLevel, RiskReason } from '@/types'

type TFn = (key: string, vars?: Record<string, string | number>) => string

export function riskVariant(level: RiskLevel): 'success' | 'warning' | 'error' {
  return level === 'red' ? 'error' : level === 'yellow' ? 'warning' : 'success'
}

/** Pure formatter for a RiskReason → localized phrase (e.g. "accuracy 61%").
 *  Signed for trend; the value-less "no activity" case uses a distinct key. */
export function reasonText(r: RiskReason, t: TFn): string {
  if (r.signal === 'activity_recency' && r.value === null) {
    return t('teacher.risk.reason.activity_recency_none')
  }
  const n = typeof r.value === 'number' ? Math.round(r.value) : r.value
  const value = r.signal === 'accuracy_trend' && typeof n === 'number' && n > 0 ? `+${n}` : String(n)
  return t(`teacher.risk.reason.${r.signal}`, { value })
}

export function RiskBadge({ level, className }: { level: RiskLevel; className?: string }) {
  const t = useT()
  return (
    <Badge variant={riskVariant(level)} className={className}>
      {t(`teacher.risk.level.${level}`)}
    </Badge>
  )
}

/** Hook binding {@link reasonText} to the active locale's translator. */
export function useReasonText() {
  const t = useT()
  return (r: RiskReason): string => reasonText(r, t)
}
