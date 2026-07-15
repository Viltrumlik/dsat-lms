// ═══════════════════════════════════════
// DSAT LMS v2 — Attendance API (Phase 5.2a)
// Domain: Academy (staff)
// Description: Dated class sessions + per-student attendance marking. Staff-scoped
//   under /api/v1/teacher/ (teachers own classes; admin/manager/reception all).
// ═══════════════════════════════════════

import { del, get, getPaginated, patch, post, put } from './client'
import type {
  AttendanceRow,
  ClassScheduleRule,
  ClassSession,
  ClassSessionDetail,
} from '@/types'

export interface ScheduleRulePayload {
  weekday: number
  startTime: string
  endTime?: string | null
  title?: string
  location?: string
  isActive?: boolean
}

export interface SessionListParams {
  classId?: string
  from?: string
  to?: string
  cursor?: string
}

export interface CreateSessionPayload {
  klass: string
  title?: string
  startsAt: string
  endsAt?: string | null
  location?: string
}

export interface AttendanceMark {
  student: string
  status: string
  note?: string
}

export const attendanceAPI = {
  listSessions: (params: SessionListParams = {}) =>
    getPaginated<ClassSession>('/teacher/class-sessions/', params),

  createSession: (payload: CreateSessionPayload) =>
    post<ClassSession>('/teacher/class-sessions/', payload),

  getSession: (id: string) => get<ClassSessionDetail>(`/teacher/class-sessions/${id}/`),

  updateSession: (id: string, payload: Partial<CreateSessionPayload> & { status?: string }) =>
    patch<ClassSession>(`/teacher/class-sessions/${id}/`, payload),

  mark: (id: string, marks: AttendanceMark[]) =>
    put<AttendanceRow[]>(`/teacher/class-sessions/${id}/attendance/`, { marks }),

  // Recurring schedule rules (5.2b)
  listRules: (classId: string) =>
    get<ClassScheduleRule[]>(`/teacher/classes/${classId}/schedule-rules/`),

  createRule: (classId: string, payload: ScheduleRulePayload) =>
    post<ClassScheduleRule>(`/teacher/classes/${classId}/schedule-rules/`, payload),

  updateRule: (id: string, payload: Partial<ScheduleRulePayload>) =>
    patch<ClassScheduleRule>(`/teacher/schedule-rules/${id}/`, payload),

  deleteRule: (id: string) => del<void>(`/teacher/schedule-rules/${id}/`),
}
