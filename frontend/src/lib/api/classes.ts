// ═══════════════════════════════════════
// DSAT LMS v2 — Classes API (membership-scoped)
// Domain: Academy
// Description: The classroom stream, reachable by anyone IN the class. Distinct
//   from lib/api/teacher.ts, which is the teacher's management surface — these
//   endpoints answer to membership, not to role.
// ═══════════════════════════════════════

import { del, get, getPaginated, post } from './client'
import type {
  ClassComment,
  ClassMeeting,
  ClassPeople,
  ClassPost,
  ClassworkItem,
  MyClass,
  Pagination,
} from '@/types'

export interface NewPostPayload {
  body: string
  kind?: 'post' | 'announcement' | 'material'
  isPinned?: boolean
  allowComments?: boolean
  attachmentIds?: string[]
}

export const classesAPI = {
  /** Every class the current user is in — taught or attended. */
  mine: () => get<MyClass[]>('/classes/'),

  /** The workspace header, and the capabilities its tabs hang off. */
  detail: (classId: string) => get<MyClass>(`/classes/${classId}/`),

  people: (classId: string) => get<ClassPeople>(`/classes/${classId}/people/`),

  /** Homework and materials in one list, each role seeing its own half. */
  classwork: (classId: string) => get<ClassworkItem[]>(`/classes/${classId}/classwork/`),

  schedule: (classId: string) => get<ClassMeeting[]>(`/classes/${classId}/schedule/`),

  stream: (
    classId: string,
    cursor?: string
  ): Promise<{ data: ClassPost[]; pagination?: Pagination }> =>
    getPaginated<ClassPost>(`/classes/${classId}/stream/`, cursor ? { cursor } : undefined),

  /** Staff only — the server refuses a student. */
  createPost: (classId: string, payload: NewPostPayload) =>
    post<ClassPost>(`/classes/${classId}/stream/`, payload),

  removePost: (classId: string, postId: string) =>
    del<void>(`/classes/${classId}/stream/${postId}/`),

  reply: (classId: string, postId: string, body: string) =>
    post<ClassComment>(`/classes/${classId}/stream/${postId}/comments/`, { body }),

  removeReply: (classId: string, postId: string, commentId: string) =>
    del<void>(`/classes/${classId}/stream/${postId}/comments/${commentId}/`),
}
