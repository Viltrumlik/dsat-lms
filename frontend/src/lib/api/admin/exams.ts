// ═══════════════════════════════════════
// DSAT LMS v2 — Admin Exams + Assignments API
// Domain: Assessments (admin exam builder)
// Description: Exam template CRUD, sections + section questions (add / reorder /
//   remove, from the published bank), and assignment CRUD + progress. IsAdmin.
// ═══════════════════════════════════════

import { del, get, getPaginated, patch, post } from '../client'
import type {
  AccessLevel,
  AdminAssignment,
  AdminExam,
  AdminSection,
  AssignmentSessionRow,
  ExamListItem,
  ExamModule,
  ExamType,
  QuestionModule,
  SectionQuestion,
} from '@/types'

export interface ExamListParams {
  type?: ExamType
  module?: ExamModule
  accessLevel?: AccessLevel
  search?: string
  cursor?: string
}

export interface ExamWritePayload {
  type: ExamType
  title: string
  description?: string | null
  module: ExamModule
  timeLimit?: number | null
  isAdaptive?: boolean
  accessLevel: AccessLevel
}

export interface SectionWritePayload {
  module: QuestionModule
  title?: string
  sectionNumber?: number
  timeLimit?: number | null
  sortOrder?: number
}

export const adminExamsAPI = {
  list: (params?: ExamListParams) => getPaginated<ExamListItem>('/admin/exams/', params),
  get: (id: string) => get<AdminExam>(`/admin/exams/${id}/`),
  create: (payload: ExamWritePayload) => post<AdminExam>('/admin/exams/', payload),
  update: (id: string, payload: Partial<ExamWritePayload>) =>
    patch<AdminExam>(`/admin/exams/${id}/`, payload),
  remove: (id: string) => del<void>(`/admin/exams/${id}/`),

  // Sections
  createSection: (examId: string, payload: SectionWritePayload) =>
    post<AdminSection>(`/admin/exams/${examId}/sections/`, payload),
  updateSection: (examId: string, sectionId: number, payload: Partial<SectionWritePayload>) =>
    patch<AdminSection>(`/admin/exams/${examId}/sections/${sectionId}/`, payload),
  removeSection: (examId: string, sectionId: number) =>
    del<void>(`/admin/exams/${examId}/sections/${sectionId}/`),

  // Section questions
  addQuestion: (examId: string, sectionId: number, questionId: string) =>
    post<SectionQuestion>(`/admin/exams/${examId}/sections/${sectionId}/questions/`, {
      question: questionId,
    }),
  reorderQuestions: (examId: string, sectionId: number, order: number[]) =>
    post<AdminSection>(`/admin/exams/${examId}/sections/${sectionId}/questions/reorder/`, { order }),
  removeQuestion: (examId: string, sectionId: number, examQuestionId: number) =>
    del<void>(`/admin/exams/${examId}/sections/${sectionId}/questions/${examQuestionId}/`),
}

export interface AssignmentWritePayload {
  exam: string
  assignedClass?: string | null
  assignedStudent?: string | null
  opensAt: string
  closesAt: string
  maxAttempts?: number
  instructions?: string | null
}

export const adminAssignmentsAPI = {
  list: (params?: { exam?: string; cursor?: string }) =>
    getPaginated<AdminAssignment>('/admin/assignments/', params),
  get: (id: string) => get<AdminAssignment>(`/admin/assignments/${id}/`),
  create: (payload: AssignmentWritePayload) => post<AdminAssignment>('/admin/assignments/', payload),
  update: (id: string, payload: Partial<AssignmentWritePayload>) =>
    patch<AdminAssignment>(`/admin/assignments/${id}/`, payload),
  remove: (id: string) => del<void>(`/admin/assignments/${id}/`),
  sessions: (id: string) => get<AssignmentSessionRow[]>(`/admin/assignments/${id}/sessions/`),
}
