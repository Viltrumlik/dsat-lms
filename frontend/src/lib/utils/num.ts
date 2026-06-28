// ═══════════════════════════════════════
// DSAT LMS v2 — Numeric coercion
// Domain: All
// Description: DRF serializes DecimalField as a string by default, so accuracy /
//   percentile fields can arrive as "75.50". num() reads either form safely.
// ═══════════════════════════════════════

import type { Decimalish } from '@/types'

/** Coerce a possibly-string decimal to a number, or null when absent/invalid. */
export function num(value: Decimalish | undefined): number | null {
  if (value === null || value === undefined || value === '') return null
  const n = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(n) ? n : null
}

/** Format a percentage value (0–100) for display, e.g. "75.5%". */
export function pct(value: Decimalish | undefined, digits = 1): string {
  const n = num(value)
  if (n === null) return '—'
  return `${n.toFixed(digits)}%`
}

/** Format seconds as "1h 23m" / "23m 4s" / "44s". */
export function formatDuration(totalSeconds: number | null | undefined): string {
  if (totalSeconds == null || totalSeconds < 0) return '—'
  const h = Math.floor(totalSeconds / 3600)
  const m = Math.floor((totalSeconds % 3600) / 60)
  const s = Math.floor(totalSeconds % 60)
  if (h > 0) return `${h}h ${m}m`
  if (m > 0) return `${m}m ${s}s`
  return `${s}s`
}
