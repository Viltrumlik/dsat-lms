// ═══════════════════════════════════════
// DSAT LMS v2 — Office Hours API (Phase 4 S5)
// Domain: Support
// Description: Student browse/join/leave + teacher templates + staff session
//   management (roster/cancel/attendance). Bodies are camelCase (client transforms).
// ═══════════════════════════════════════

import { del, get, patch, post } from '../client'
import type {
  OfficeHour,
  OfficeHourSession,
  OfficeHourSessionRoster,
  SupportSubject,
} from '@/types'

export interface OfficeHourPayload {
  subject: SupportSubject
  title: string
  description?: string
  weekday: number
  startTime: string
  endTime: string
  capacity?: number
  openToAll?: boolean
  location?: string
  joinUrl?: string
  isActive?: boolean
}

export const officeHoursAPI = {
  // ─── Student ───
  browse: (subject?: SupportSubject) =>
    get<OfficeHourSession[]>('/support/office-hours/', subject ? { subject } : undefined),
  mine: () => get<OfficeHourSession[]>('/support/office-hours/mine/'),
  join: (id: string) => post<OfficeHourSession>(`/support/office-hours/${id}/join/`),
  leave: (id: string) => post<OfficeHourSession>(`/support/office-hours/${id}/leave/`),

  // ─── Teacher: templates ───
  templates: () => get<OfficeHour[]>('/support/office-hour-templates/'),
  createTemplate: (payload: OfficeHourPayload) =>
    post<OfficeHour>('/support/office-hour-templates/', payload),
  updateTemplate: (id: string, payload: Partial<OfficeHourPayload>) =>
    patch<OfficeHour>(`/support/office-hour-templates/${id}/`, payload),
  removeTemplate: (id: string) => del<void>(`/support/office-hour-templates/${id}/`),

  // ─── Staff: sessions ───
  staffSessions: () => get<OfficeHourSession[]>('/support/staff/office-hours/'),
  roster: (id: string) => get<OfficeHourSessionRoster>(`/support/staff/office-hours/${id}/roster/`),
  cancel: (id: string) => post<OfficeHourSessionRoster>(`/support/staff/office-hours/${id}/cancel/`),
  markAttendance: (id: string, student: string, attended: boolean) =>
    post<OfficeHourSessionRoster>(`/support/staff/office-hours/${id}/attendance/`, {
      student,
      attended,
    }),
}
