// ═══════════════════════════════════════
// DSAT LMS v2 — CRM tags + student notes/timeline API
// Domain: CRM (Phase 5.5b). Tags under /admin/crm/tags/; notes + timeline under
//   /admin/students/<id>/. IsAdmin.
// ═══════════════════════════════════════

import { del, get, patch, post } from '../client'
import type { CrmTag, StudentNote, TaggableEntity, TimelineEvent } from '@/types'

export const crmTagsAPI = {
  list: () => get<CrmTag[]>('/admin/crm/tags/'),
  create: (name: string, color = '') => post<CrmTag>('/admin/crm/tags/', { name, color }),
  remove: (id: string) => del<void>(`/admin/crm/tags/${id}/`),
  forEntity: (type: TaggableEntity, id: string) =>
    get<CrmTag[]>(`/admin/crm/tags/${type}/${id}/`),
  assign: (type: TaggableEntity, id: string, tag: string) =>
    post<CrmTag[]>(`/admin/crm/tags/${type}/${id}/`, { tag }),
  unassign: (type: TaggableEntity, id: string, tagId: string) =>
    del<void>(`/admin/crm/tags/${type}/${id}/${tagId}/`),
}

export const studentNotesAPI = {
  list: (studentId: string) => get<StudentNote[]>(`/admin/students/${studentId}/notes/`),
  create: (studentId: string, body: string, pinned = false) =>
    post<StudentNote>(`/admin/students/${studentId}/notes/`, { body, pinned }),
  update: (studentId: string, noteId: string, payload: { body?: string; pinned?: boolean }) =>
    patch<StudentNote>(`/admin/students/${studentId}/notes/${noteId}/`, payload),
  remove: (studentId: string, noteId: string) =>
    del<void>(`/admin/students/${studentId}/notes/${noteId}/`),
  timeline: (studentId: string) =>
    get<TimelineEvent[]>(`/admin/students/${studentId}/timeline/`),
}
