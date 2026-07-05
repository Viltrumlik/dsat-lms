import { describe, it, expect } from 'vitest'
import { reasonText, riskVariant } from './RiskBadge'
import type { RiskReason } from '@/types'

// Stub t: echoes "key|{params}" so we can assert key + param selection.
const t = (key: string, params?: Record<string, string | number>) =>
  `${key}|${JSON.stringify(params ?? {})}`

function reason(overrides: Partial<RiskReason>): RiskReason {
  return { signal: 'accuracy', level: 'red', value: 40, unit: 'percent', message: '', ...overrides }
}

describe('riskVariant', () => {
  it('maps risk levels to badge variants', () => {
    expect(riskVariant('green')).toBe('success')
    expect(riskVariant('yellow')).toBe('warning')
    expect(riskVariant('red')).toBe('error')
  })
})

describe('reasonText', () => {
  it('renders a plain percent signal', () => {
    expect(reasonText(reason({ signal: 'homework_completion', value: 45 }), t)).toBe(
      'teacher.risk.reason.homework_completion|{"value":"45"}'
    )
  })

  it('signs a positive accuracy trend', () => {
    expect(reasonText(reason({ signal: 'accuracy_trend', value: 3 }), t)).toBe(
      'teacher.risk.reason.accuracy_trend|{"value":"+3"}'
    )
  })

  it('keeps a negative trend as-is', () => {
    expect(reasonText(reason({ signal: 'accuracy_trend', value: -12 }), t)).toBe(
      'teacher.risk.reason.accuracy_trend|{"value":"-12"}'
    )
  })

  it('uses the value-less key when activity has never been recorded', () => {
    expect(
      reasonText(reason({ signal: 'activity_recency', value: null, unit: 'days' }), t)
    ).toBe('teacher.risk.reason.activity_recency_none|{}')
  })
})
