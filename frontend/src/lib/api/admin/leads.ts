// ═══════════════════════════════════════
// DSAT LMS v2 — Leads (CRM) API
// Domain: CRM (front-office leads). Endpoints live under /staff/ (IsFrontOffice);
//   the admin UI consumes them. camel↔snake transform is automatic.
// ═══════════════════════════════════════

import { del, get, getPaginated, patch, post } from '../client'
import type {
  FollowUpTask,
  LeadActivity,
  LeadActivityKind,
  LeadBoard,
  LeadDetail,
  LeadListItem,
  LeadSource,
  LeadStage,
  LeadSubject,
} from '@/types'

export interface LeadWritePayload {
  name: string
  email?: string
  phone?: string
  stage?: LeadStage
  source?: LeadSource
  subjectInterest?: LeadSubject
  note?: string
  owner?: string | null
}

export interface LeadListParams {
  stage?: string
  owner?: string
  search?: string
  cursor?: string
}

export const leadsAPI = {
  list: (params?: LeadListParams) => getPaginated<LeadListItem>('/staff/leads/', params),
  board: () => get<LeadBoard>('/staff/leads/board/'),
  get: (id: string) => get<LeadDetail>(`/staff/leads/${id}/`),
  create: (payload: LeadWritePayload) => post<LeadDetail>('/staff/leads/', payload),
  update: (id: string, payload: Partial<LeadWritePayload>) =>
    patch<LeadDetail>(`/staff/leads/${id}/`, payload),
  remove: (id: string) => del<void>(`/staff/leads/${id}/`),
  convert: (id: string) => post<LeadDetail>(`/staff/leads/${id}/convert/`, {}),

  // Activities
  addActivity: (id: string, kind: LeadActivityKind, body: string) =>
    post<LeadActivity>(`/staff/leads/${id}/activities/`, { kind, body }),

  // Follow-up tasks
  addTask: (id: string, title: string, dueAt: string, assignee?: string | null) =>
    post<FollowUpTask>(`/staff/leads/${id}/tasks/`, { title, dueAt, assignee }),
  updateTask: (taskId: string, payload: { done?: boolean; title?: string; dueAt?: string }) =>
    patch<FollowUpTask>(`/staff/leads/tasks/${taskId}/`, payload),
  removeTask: (taskId: string) => del<void>(`/staff/leads/tasks/${taskId}/`),
}
