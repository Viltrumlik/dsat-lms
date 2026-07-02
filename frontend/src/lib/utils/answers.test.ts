import { describe, it, expect } from 'vitest'
import { answersMatch } from './answers'

describe('answersMatch', () => {
  it('accepts equivalent fraction and decimal forms', () => {
    expect(answersMatch('3.5', '7/2')).toBe(true)
    expect(answersMatch('7/2', '3.5')).toBe(true)
    expect(answersMatch('.5', '0.5')).toBe(true)
    expect(answersMatch('36.0', '36')).toBe(true)
    expect(answersMatch('1/3', '2/6')).toBe(true)
    expect(answersMatch('-0.25', '-1/4')).toBe(true)
    expect(answersMatch(' 7 / 2 ', '3.5')).toBe(true)
  })

  it('rejects non-equivalent numbers', () => {
    expect(answersMatch('3.5', '7/3')).toBe(false)
    expect(answersMatch('0.33', '1/3')).toBe(false) // 0.33 is not exactly 1/3
    expect(answersMatch('36', '-36')).toBe(false)
  })

  it('avoids float rounding traps', () => {
    expect(answersMatch('0.1', '1/10')).toBe(true)
    expect(answersMatch('0.30000000000000004', '0.3')).toBe(false)
  })

  it('falls back to case-insensitive string equality for non-numeric answers', () => {
    expect(answersMatch('B', 'b')).toBe(true)
    expect(answersMatch('B', 'C')).toBe(false)
    expect(answersMatch('x=2', 'X=2')).toBe(true)
  })

  it('does not treat malformed numerics as numbers', () => {
    expect(answersMatch('1/0', '1/0')).toBe(true) // string-equal fallback
    expect(answersMatch('.', '.')).toBe(true) // string-equal fallback
    expect(answersMatch('1/0', '2/0')).toBe(false)
  })
})
