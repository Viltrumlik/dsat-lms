// ═══════════════════════════════════════
// DSAT LMS v2 — Admin Users API
// Domain: Identity (admin)
// Description: Admin user management — list (filters + search + cursor pagination),
//   create, detail, update, change role, deactivate/reactivate, soft-delete,
//   set password. All endpoints require role='admin' (enforced server-side).
// ═══════════════════════════════════════

import { del, get, getPaginated, patch, post } from '../client'
import type { AdminUser, UserRole } from '@/types'

export interface AdminUserListParams {
  role?: UserRole
  isActive?: boolean
  isEmailVerified?: boolean
  search?: string
  includeDeleted?: boolean
  cursor?: string
}

export interface CreateUserPayload {
  email: string
  password: string
  firstName: string
  lastName: string
  role: UserRole
  isEmailVerified?: boolean
}

export interface UpdateUserPayload {
  firstName?: string
  lastName?: string
  email?: string
  isEmailVerified?: boolean
  satTargetScore?: number | null
  examDate?: string | null
  timezone?: string
}

export const adminUsersAPI = {
  /** Paginated, filterable user list. */
  list: (params?: AdminUserListParams) => getPaginated<AdminUser>('/admin/users/', params),

  get: (id: string) => get<AdminUser>(`/admin/users/${id}/`),

  create: (payload: CreateUserPayload) => post<AdminUser>('/admin/users/', payload),

  update: (id: string, payload: UpdateUserPayload) =>
    patch<AdminUser>(`/admin/users/${id}/`, payload),

  changeRole: (id: string, role: UserRole) =>
    patch<AdminUser>(`/admin/users/${id}/role/`, { role }),

  deactivate: (id: string) => post<AdminUser>(`/admin/users/${id}/deactivate/`),

  reactivate: (id: string) => post<AdminUser>(`/admin/users/${id}/reactivate/`),

  /** Soft-delete (sets deleted_at + deactivates). */
  remove: (id: string) => del<void>(`/admin/users/${id}/`),

  setPassword: (id: string, newPassword: string) =>
    post<{ detail: string }>(`/admin/users/${id}/set-password/`, { newPassword }),

  /** Bulk-create from CSV text (header: email, first_name, last_name, role, password?). */
  importCsv: (csv: string) => post<ImportResult>('/admin/users/import/', { csv }),
}

export interface ImportResult {
  createdCount: number
  skippedCount: number
  errorCount: number
  created: string[]
  skipped: { email: string; reason: string }[]
  errors: { line: number; error: string }[]
}
