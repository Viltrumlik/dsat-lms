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

  /**
   * Hand work in — a written response, files, or just the acknowledgement.
   * Also the way a RETURNED piece is handed in again (attempt N+1).
   */
  submit: (id: string, payload: SubmitPayload = {}) =>
    post<HomeworkSubmission>(`/homework/${id}/submit/`, {
      responseText: payload.responseText ?? '',
      attachmentIds: payload.attachmentIds ?? [],
    }),

  /** Teacher: record a mark + feedback. Own classes only (404 otherwise). */
  grade: (id: string, submissionId: string, payload: GradePayload) =>
    post<HomeworkSubmission>(`/homework/${id}/submissions/${submissionId}/grade/`, payload),

  /** Teacher: hand the work back for another go, with a note saying why. */
  returnForRevision: (id: string, submissionId: string, note: string) =>
    post<HomeworkSubmission>(`/homework/${id}/submissions/${submissionId}/return/`, { note }),
}

export interface SubmitPayload {
  responseText?: string
  attachmentIds?: string[]
}

export interface GradePayload {
  grade?: string | null
  gradeScale?: number
  feedback?: string
}
