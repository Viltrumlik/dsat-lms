// Domain: Test Engine
// Description: Bluebook chrome labelling — banner per exam type + SAT
//   section/module numbering derived from flat engine sections.

import { describe, it, expect } from 'vitest'
import { bannerKey, sectionLabel, sectionPositions } from './examLabels'
import { en } from '@/lib/i18n/dictionaries/en'
import type { EngineSection, ExamType, QuestionModule } from '@/types'

/** Minimal t() that resolves dotted keys against the EN dictionary. */
const t = (key: string, vars?: Record<string, string | number>) => {
  const value = key.split('.').reduce<unknown>(
    (acc, part) => (acc as Record<string, unknown> | undefined)?.[part],
    en as unknown
  )
  let out = typeof value === 'string' ? value : key
  for (const [k, v] of Object.entries(vars ?? {})) {
    out = out.replaceAll(`{${k}}`, String(v))
  }
  return out
}

const section = (module: QuestionModule, title = ''): EngineSection => ({
  sectionNumber: 1,
  title,
  module,
  timeLimit: null,
  questions: [],
})

describe('bannerKey', () => {
  const cases: Array<[ExamType, string]> = [
    ['practice', 'This is a practice test'],
    ['past_paper', 'This is a past paper'],
    ['mock', 'This is a mock exam'],
    ['midterm', 'This is a midterm exam'],
    ['assessment', 'This is an assessment'],
    ['homework', 'This is a homework assignment'],
  ]

  it.each(cases)('labels %s exams', (type, expected) => {
    expect(t(bannerKey(type))).toBe(expected)
  })

  it('falls back to the practice banner for an unknown type', () => {
    expect(t(bannerKey(undefined))).toBe('This is a practice test')
  })
})

describe('sectionPositions', () => {
  it('numbers a standard 4-module SAT as S1M1, S1M2, S2M1, S2M2', () => {
    const positions = sectionPositions([
      section('reading_writing'),
      section('reading_writing'),
      section('math'),
      section('math'),
    ])
    expect(positions.map((p) => [p.section, p.module])).toEqual([
      [1, 1],
      [1, 2],
      [2, 1],
      [2, 2],
    ])
    expect(positions.every((p) => p.modulesInSection === 2)).toBe(true)
  })

  it('treats a single module per subject as its own section', () => {
    const positions = sectionPositions([section('math'), section('reading_writing')])
    expect(positions.map((p) => [p.section, p.module, p.modulesInSection])).toEqual([
      [1, 1, 1],
      [2, 1, 1],
    ])
  })
})

describe('sectionLabel', () => {
  const full = [
    section('reading_writing'),
    section('reading_writing'),
    section('math'),
    section('math'),
  ]

  it('composes the Bluebook label for a multi-module section', () => {
    expect(sectionLabel(full, 0, t)).toBe('Section 1, Module 1: Reading and Writing')
    expect(sectionLabel(full, 3, t)).toBe('Section 2, Module 2: Math')
  })

  it('drops "Module" when a section has only one', () => {
    expect(sectionLabel([section('math')], 0, t)).toBe('Section 1: Math')
  })

  it('uses an admin-authored title as the subject, keeping the Bluebook prefix', () => {
    const custom = [section('math', 'Warm-up drill')]
    expect(sectionLabel(custom, 0, t)).toBe('Section 1: Warm-up drill')
  })

  it('keeps the seeded module titles in the Bluebook shape', () => {
    const seeded = [section('reading_writing', 'Reading and Writing'), section('math', 'Math')]
    expect(sectionLabel(seeded, 0, t)).toBe('Section 1: Reading and Writing')
    expect(sectionLabel(seeded, 1, t)).toBe('Section 2: Math')
  })

  it('does not double-prefix a title that already carries one', () => {
    const custom = [section('math', 'Section 2, Module 1: Math')]
    expect(sectionLabel(custom, 0, t)).toBe('Section 2, Module 1: Math')
  })

  it('returns an empty string for an out-of-range index', () => {
    expect(sectionLabel(full, 9, t)).toBe('')
  })
})
