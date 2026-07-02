// ═══════════════════════════════════════
// DSAT LMS v2 — Exam-date parsing
// Domain: Student
// Description: exam_date is a date-only string ('YYYY-MM-DD') from a Django
//   DateField. parseISO reads it as LOCAL midnight; `new Date(s)` would read it
//   as UTC midnight and shift the calendar day for negative-UTC (e.g. US) users,
//   throwing off the dashboard countdown. Returns null if unparseable.
// ═══════════════════════════════════════

import { isValid, parseISO } from 'date-fns'

export function parseExamDate(examDate: string): Date | null {
  const d = parseISO(examDate)
  return isValid(d) ? d : null
}
