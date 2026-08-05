// Domain: Student / Assessments
// Description: The exam-type catalog — one entry per kind of paper a student can
//   sit, and the single source of the URL slug for each.
//
// Everything used to live behind one "Practice tests" list on the dashboard,
// which quietly filtered to type=practice: mocks, midterms, past papers and
// assessments existed in the backend and in the admin, and a student had no way
// to reach any of them. Each type is now its own destination.
//
// `homework` is deliberately absent — homework-backed papers are reached through
// the homework surface, not as a standalone test to start.

import { ClipboardCheck, FileClock, GraduationCap, ListChecks, Timer } from 'lucide-react'
import type { ExamType } from '@/types'

export interface ExamTypeMeta {
  type: ExamType
  /** URL segment under /tests/. */
  slug: string
  /** i18n keys — `tests.types.<key>.{title,subtitle,empty}`. */
  key: string
  icon: React.ComponentType<{ className?: string }>
  /** Hidden from public users. The API enforces this server-side too. */
  academyOnly: boolean
}

export const EXAM_TYPES: ExamTypeMeta[] = [
  { type: 'practice', slug: 'practice', key: 'practice', icon: ListChecks, academyOnly: false },
  { type: 'past_paper', slug: 'past-papers', key: 'pastPaper', icon: FileClock, academyOnly: false },
  { type: 'mock', slug: 'mock', key: 'mock', icon: Timer, academyOnly: true },
  { type: 'midterm', slug: 'midterm', key: 'midterm', icon: GraduationCap, academyOnly: true },
  {
    type: 'assessment',
    slug: 'assessment',
    key: 'assessment',
    icon: ClipboardCheck,
    academyOnly: true,
  },
]

export function examTypeBySlug(slug: string): ExamTypeMeta | undefined {
  return EXAM_TYPES.find((e) => e.slug === slug)
}
