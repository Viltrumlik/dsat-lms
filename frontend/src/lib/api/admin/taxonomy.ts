// ═══════════════════════════════════════
// DSAT LMS v2 — Admin Taxonomy API
// Domain: Question Bank (admin)
// Description: Categories + tags used by the question editor's selectors and (later)
//   a management surface. IsAdmin server-side.
// ═══════════════════════════════════════

import { del, get, patch, post } from '../client'
import type { QuestionCategory, QuestionModule, QuestionTag } from '@/types'

export interface CategoryPayload {
  module: QuestionModule
  name: string
  slug: string
  parent?: string | null
  sortOrder?: number
}

export interface TagPayload {
  name: string
  slug: string
  color?: string
}

export const adminCategoriesAPI = {
  list: (module?: QuestionModule) =>
    get<QuestionCategory[]>('/admin/categories/', module ? { module } : undefined),
  create: (payload: CategoryPayload) => post<QuestionCategory>('/admin/categories/', payload),
  update: (id: string, payload: Partial<CategoryPayload>) =>
    patch<QuestionCategory>(`/admin/categories/${id}/`, payload),
  remove: (id: string) => del<void>(`/admin/categories/${id}/`),
}

export const adminTagsAPI = {
  list: () => get<QuestionTag[]>('/admin/tags/'),
  create: (payload: TagPayload) => post<QuestionTag>('/admin/tags/', payload),
  update: (id: string, payload: Partial<TagPayload>) =>
    patch<QuestionTag>(`/admin/tags/${id}/`, payload),
  remove: (id: string) => del<void>(`/admin/tags/${id}/`),
}
