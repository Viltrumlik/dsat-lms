// ═══════════════════════════════════════
// DSAT LMS v2 — Academic Mentor API (Phase 4 S6)
// Domain: Academy (mentor)
// Description: A mentor's own mentee surfaces — their mentee list, a per-mentee
//   header (mentor-scoped, not class-scoped), check-ins, and parent-contact logs
//   — plus assign/unassign (admin/academic_manager only). All row-scoped
//   server-side (a mentor sees only their mentees; out-of-scope → 404).
// ═══════════════════════════════════════

import { get, post } from './client'
import type {
  ContactMethod,
  Mentee,
  MenteeDetail,
  MentorCheckIn,
  ParentContactLog,
  StudentProfile,
} from '@/types'

export interface ParentContactInput {
  guardian: string // Guardian id
  method: ContactMethod
  note?: string
}

export const mentorAPI = {
  /** The requester's mentees (students where mentor = me). */
  myMentees: () => get<Mentee[]>('/teacher/mentees/'),

  /** A mentee's header (student + status + guardians) for the drilldown. */
  menteeDetail: (studentId: string) => get<MenteeDetail>(`/students/${studentId}/mentee/`),

  /** Check-in log, newest first is not guaranteed — order client-side if needed. */
  checkIns: (studentId: string) => get<MentorCheckIn[]>(`/students/${studentId}/checkins/`),
  addCheckIn: (studentId: string, note: string) =>
    post<MentorCheckIn>(`/students/${studentId}/checkins/`, { note }),

  parentContacts: (studentId: string) =>
    get<ParentContactLog[]>(`/students/${studentId}/parent-contacts/`),
  addParentContact: (studentId: string, payload: ParentContactInput) =>
    post<ParentContactLog>(`/students/${studentId}/parent-contacts/`, payload),

  // Assignment (admin / academic_manager). Assign by email (mirrors enroll-by-email).
  assign: (studentId: string, email: string) =>
    post<StudentProfile>(`/students/${studentId}/mentor/`, { email }),
  unassign: (studentId: string) =>
    post<StudentProfile>(`/students/${studentId}/mentor/`, { mentor: null }),
}
