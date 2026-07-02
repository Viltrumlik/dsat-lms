// ═══════════════════════════════════════
// DSAT LMS v2 — Homework API
// Domain: Homework
// Description: Academy homework — students list/read their classes' assignments
//   and submit. Unpaginated (class-scoped, small lists). Teacher-side create +
//   submissions live in lib/api/teacher.ts.
// ═══════════════════════════════════════

import { get, post } from './client'
import type { Homework, HomeworkSubmission, SessionDetail } from '@/types'

export const homeworkAPI = {
  /** All homework visible to the current user (newest first, unpaginated). */
  list: () => get<Homework[]>('/homework/'),

  get: (id: string) => get<Homework>(`/homework/${id}/`),

  /**
   * Start the linked exam. The session is bound to the student's submission, so
   * submitting the test turns the homework in automatically.
   */
  start: (id: string) => post<SessionDetail>(`/homework/${id}/start/`),

  /** Mark the homework submitted manually (plain homework / fallback). */
  submit: (id: string) => post<HomeworkSubmission>(`/homework/${id}/submit/`),
}
