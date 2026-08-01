// Domain: Test Engine
// Description: Derives the Bluebook chrome labels — the navy banner text and
//   the "Section N, Module M: <subject>" header — from session data.
//   Every exam type (practice, past paper, mock, midterm, assessment,
//   homework) renders the same chrome; only the banner wording differs.

import type { EngineSection, ExamType, QuestionModule } from '@/types'

type TFn = (key: string, vars?: Record<string, string | number>) => string

/** i18n key for the navy banner, per exam type. */
export function bannerKey(examType: ExamType | undefined): string {
  switch (examType) {
    case 'past_paper':
      return 'testEngine.banner.pastPaper'
    case 'mock':
      return 'testEngine.banner.mock'
    case 'midterm':
      return 'testEngine.banner.midterm'
    case 'assessment':
      return 'testEngine.banner.assessment'
    case 'homework':
      return 'testEngine.banner.homework'
    case 'practice':
    default:
      return 'testEngine.banner.practice'
  }
}

/** Human name for a module ("Reading and Writing" / "Math"). */
export function moduleName(module: QuestionModule | undefined, t: TFn): string {
  return module === 'math' ? t('testEngine.moduleMath') : t('testEngine.moduleRw')
}

export interface SectionPosition {
  /** 1-based index of the module group (R&W = 1, Math = 2 on a full SAT). */
  section: number
  /** 1-based index within that group. */
  module: number
  /** Total modules in this section — 1 means the "Module N" part is dropped. */
  modulesInSection: number
}

/**
 * Maps flat engine sections onto SAT section/module numbering by grouping
 * *consecutive* sections that share a module. A standard 4-section exam
 * (rw, rw, math, math) becomes S1M1, S1M2, S2M1, S2M2.
 */
export function sectionPositions(sections: EngineSection[]): SectionPosition[] {
  const out: SectionPosition[] = []
  let section = 0
  let moduleNo = 0
  let prev: QuestionModule | null = null

  for (const s of sections) {
    if (s.module !== prev) {
      section += 1
      moduleNo = 1
      prev = s.module
    } else {
      moduleNo += 1
    }
    out.push({ section, module: moduleNo, modulesInSection: 0 })
  }
  // Back-fill the group size so single-module sections can drop "Module 1".
  const counts = new Map<number, number>()
  for (const p of out) counts.set(p.section, (counts.get(p.section) ?? 0) + 1)
  for (const p of out) p.modulesInSection = counts.get(p.section) ?? 1
  return out
}

/**
 * The header title for a section, always in the Bluebook shape
 * ("Section 1, Module 1: Reading and Writing").
 *
 * An admin-authored `section.title` supplies the subject half, so a custom
 * label still reads like the real exam. A title that already carries its own
 * "Section …" prefix is used verbatim, so we never double-prefix it.
 */
export function sectionLabel(sections: EngineSection[], index: number, t: TFn): string {
  const section = sections[index]
  if (!section) return ''

  const authored = section.title?.trim() ?? ''
  const pos = sectionPositions(sections)[index]
  if (!pos) return authored || moduleName(section.module, t)

  // Already a full label (e.g. "Section 2, Module 1: Math") — leave it alone.
  const sectionWord = t('testEngine.sectionLabelNoModule', { section: '', subject: '' })
    .replace(/[:\s]+/g, ' ')
    .trim()
  if (authored && sectionWord && authored.toLowerCase().includes(sectionWord.toLowerCase())) {
    return authored
  }

  const subject = authored || moduleName(section.module, t)
  if (pos.modulesInSection <= 1) {
    return t('testEngine.sectionLabelNoModule', { section: pos.section, subject })
  }
  return t('testEngine.sectionLabel', {
    section: pos.section,
    module: pos.module,
    subject,
  })
}

/** Directions body text for a section's module. */
export function directionsKey(module: QuestionModule | undefined): string {
  return module === 'math'
    ? 'testEngine.directions.math'
    : 'testEngine.directions.readingWriting'
}
