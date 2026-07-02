// ═══════════════════════════════════════
// DSAT LMS v2 — Teacher API
// Domain: Academy / Homework (teacher-facing)
// Description: A teacher manages their own classes (list/create, roster, enroll
//   by email) and homework (assign, view submissions). All endpoints are scoped
//   server-side to the requesting teacher's classes (admin sees all).
// ═══════════════════════════════════════

import { get, post } from './client'
import type { Homework, HomeworkSubmission, RosterEntry, TeacherClass } from '@/types'

export interface CreateHomeworkPayload {
  title: string
  description?: string
  assignedClass: string // Class id
  exam?: string | null // ExamTemplate id — omit/null for a plain task
  dueAt: string // ISO datetime
}

export const teacherAPI = {
  /** Own classes, newest first (unpaginated). */
  classes: () => get<TeacherClass[]>('/teacher/classes/'),

  createClass: (name: string) => post<TeacherClass>('/teacher/classes/', { name }),

  /** Active enrollments for one of the teacher's classes. */
  roster: (classId: string) => get<RosterEntry[]>(`/teacher/classes/${classId}/roster/`),

  /** Enroll an existing user by email (re-activates a previous enrollment). */
  enroll: (classId: string, email: string) =>
    post<RosterEntry>(`/teacher/classes/${classId}/enroll/`, { email }),

  /** Assign homework to one of the teacher's classes. */
  createHomework: (payload: CreateHomeworkPayload) => post<Homework>('/homework/', payload),

  /** Per-student submissions for one of the teacher's homework assignments. */
  submissions: (homeworkId: string) =>
    get<HomeworkSubmission[]>(`/homework/${homeworkId}/submissions/`),
}
