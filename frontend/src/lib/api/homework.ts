// ═══════════════════════════════════════
// DSAT LMS v2 — Homework API
// Domain: Homework
// Description: Academy homework — students list/read their classes' assignments
//   and submit. Unpaginated (class-scoped, small lists). Teacher-side create +
//   submissions live in lib/api/teacher.ts.
// ═══════════════════════════════════════

import { get, post } from './client'
import type { Homework, HomeworkSubmission } from '@/types'

export const homeworkAPI = {
  /** All homework visible to the current user (newest first, unpaginated). */
  list: () => get<Homework[]>('/homework/'),

  get: (id: string) => get<Homework>(`/homework/${id}/`),

  /** Mark the homework submitted (idempotent — resubmit refreshes submitted_at). */
  submit: (id: string) => post<HomeworkSubmission>(`/homework/${id}/submit/`),
}
