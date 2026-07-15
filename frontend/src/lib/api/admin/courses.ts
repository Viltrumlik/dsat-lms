// ═══════════════════════════════════════
// DSAT LMS v2 — Admin Courses API
// Domain: Courses (admin authoring)
// Description: Course CRUD + publish lifecycle. Unit/lesson/reorder/attachment
//   builder ops are added in slice 5.4b. IsAdmin.
// ═══════════════════════════════════════

import { del, get, getPaginated, patch, post } from '../client'
import type { AdminCourse, AdminCourseListItem, CourseSubject } from '@/types'

export interface CourseListParams {
  status?: string
  subject?: string
  search?: string
  cursor?: string
}

export interface CourseWritePayload {
  title: string
  description?: string
  subject?: CourseSubject
  coverImageUrl?: string | null
}

export type CoursePublishAction = 'publish' | 'unpublish' | 'archive'

export const adminCoursesAPI = {
  list: (params?: CourseListParams) =>
    getPaginated<AdminCourseListItem>('/admin/courses/', params),
  get: (id: string) => get<AdminCourse>(`/admin/courses/${id}/`),
  create: (payload: CourseWritePayload) => post<AdminCourse>('/admin/courses/', payload),
  update: (id: string, payload: Partial<CourseWritePayload>) =>
    patch<AdminCourse>(`/admin/courses/${id}/`, payload),
  remove: (id: string) => del<void>(`/admin/courses/${id}/`),
  publish: (id: string, action: CoursePublishAction) =>
    post<AdminCourse>(`/admin/courses/${id}/publish/`, { action }),
}
