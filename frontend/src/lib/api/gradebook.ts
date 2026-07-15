// ═══════════════════════════════════════
// DSAT LMS v2 — Gradebook API (Phase 5.3a)
// Domain: Academy (staff)
// Description: A class's students × homework matrix + inline/bulk grade entry.
//   Staff-scoped; grade writes go through the teacher endpoints (admins allowed).
// ═══════════════════════════════════════

import { get, patch, post } from './client'
import type { Gradebook } from '@/types'

export interface GradePayload {
  grade?: number | null
  feedback?: string
}

export const gradebookAPI = {
  get: (classId: string) => get<Gradebook>(`/teacher/gradebook/?class_id=${classId}`),
  getAdmin: (classId: string) => get<Gradebook>(`/admin/gradebook/?class_id=${classId}`),
  patchGrade: (submissionId: string, payload: GradePayload) =>
    patch<Gradebook>(`/teacher/gradebook/submissions/${submissionId}/`, payload),
  bulkGrade: (grades: Array<{ submission: string } & GradePayload>) =>
    post<Gradebook>('/teacher/gradebook/bulk-grade/', { grades }),
}
