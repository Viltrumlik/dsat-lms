import { describe, it, expect } from 'vitest'
import { num, pct, formatDuration } from './num'

describe('num', () => {
  it('reads numbers and DRF string-decimals', () => {
    expect(num(75)).toBe(75)
    expect(num('75.50')).toBe(75.5)
    expect(num(0)).toBe(0)
  })

  it('returns null for absent/invalid values', () => {
    expect(num(null)).toBeNull()
    expect(num(undefined)).toBeNull()
    expect(num('')).toBeNull()
    expect(num('not-a-number')).toBeNull()
  })
})

describe('pct', () => {
  it('formats percentages', () => {
    expect(pct('75.50')).toBe('75.5%')
    expect(pct(80, 0)).toBe('80%')
    expect(pct(100)).toBe('100.0%')
  })

  it('shows an em dash when missing', () => {
    expect(pct(null)).toBe('—')
    expect(pct(undefined)).toBe('—')
  })
})

describe('formatDuration', () => {
  it('formats seconds into h/m/s', () => {
    expect(formatDuration(44)).toBe('44s')
    expect(formatDuration(64)).toBe('1m 4s')
    expect(formatDuration(3 * 3600 + 23 * 60)).toBe('3h 23m')
  })

  it('handles missing/negative', () => {
    expect(formatDuration(null)).toBe('—')
    expect(formatDuration(undefined)).toBe('—')
    expect(formatDuration(-5)).toBe('—')
  })
})
