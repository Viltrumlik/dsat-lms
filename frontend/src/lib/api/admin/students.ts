// ═══════════════════════════════════════
// DSAT LMS v2 — Admin students directory API (Phase 5.5c)
// Domain: CRM (Student-360). Distinct from /admin/users. IsAdmin.
// ═══════════════════════════════════════

import { del, get, getPaginated, post } from '../client'
import type { AdminSavedFilter, AdminStudentRow, BulkStudentResult } from '@/types'

export interface StudentDirParams {
  status?: string
  mentor?: string
  tag?: string
  class?: string
  q?: string
  cursor?: string
}

export interface BulkPayload {
  studentIds: string[]
  action: 'tag' | 'untag' | 'status'
  tag?: string
  status?: string
}

export const adminStudentsAPI = {
  list: (params?: StudentDirParams) => getPaginated<AdminStudentRow>('/admin/students/', params),
  bulk: (payload: BulkPayload) => post<BulkStudentResult>('/admin/students/bulk/', payload),

  // Saved filters (per-user)
  savedFilters: (kind = 'students') => get<AdminSavedFilter[]>(`/admin/saved-filters/?kind=${kind}`),
  saveFilter: (name: string, params: Record<string, string>, kind = 'students') =>
    post<AdminSavedFilter>('/admin/saved-filters/', { name, params, kind }),
  removeFilter: (id: string) => del<void>(`/admin/saved-filters/${id}/`),
}
