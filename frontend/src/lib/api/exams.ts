// ═══════════════════════════════════════
// DSAT LMS v2 — Exams API
// Domain: Assessments
// Description: Read-only catalog of startable exam templates (dashboard cards).
// ═══════════════════════════════════════

import { get } from './client'
import type { ExamListItem, ExamType } from '@/types'

export const examAPI = {
  /** Available exam templates for the current user (optionally filtered by type). */
  list: (type?: ExamType) => get<ExamListItem[]>('/exams/', type ? { type } : undefined),
}
