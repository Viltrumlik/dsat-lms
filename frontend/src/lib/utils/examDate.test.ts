// Pinned to a negative-UTC timezone so a regression to `new Date('YYYY-MM-DD')`
// (which parses as UTC midnight → shifts the calendar day west of UTC) is caught.
// Must run before importing anything that reads the timezone.
process.env.TZ = 'America/New_York'

import { describe, it, expect } from 'vitest'
import { differenceInCalendarDays } from 'date-fns'
import { parseExamDate } from './examDate'

describe('parseExamDate (timezone-safe date-only parsing)', () => {
  it('keeps the same calendar day in a negative-UTC timezone', () => {
    const d = parseExamDate('2026-10-03')
    expect(d).not.toBeNull()
    // Local components must match the input — the UTC-midnight bug yields Oct 2 here.
    expect(d!.getFullYear()).toBe(2026)
    expect(d!.getMonth()).toBe(9) // October (0-indexed)
    expect(d!.getDate()).toBe(3)
  })

  it('gives a 0-day countdown on the exam day itself (not -1)', () => {
    const exam = parseExamDate('2026-10-03')!
    const now = new Date(2026, 9, 3, 15, 0, 0) // same local calendar day, afternoon
    expect(differenceInCalendarDays(exam, now)).toBe(0)
  })

  it('returns null for an unparseable date', () => {
    expect(parseExamDate('not-a-date')).toBeNull()
    expect(parseExamDate('')).toBeNull()
  })
})
