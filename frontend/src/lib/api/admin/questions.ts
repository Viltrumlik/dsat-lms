// ═══════════════════════════════════════
// DSAT LMS v2 — Admin Questions API
// Domain: Question Bank (admin content studio)
// Description: Question authoring + review lifecycle. All endpoints require
//   role='admin' (enforced server-side). Questions are NOT versioned: update()
//   edits in place at any status and the change is live everywhere at once.
// ═══════════════════════════════════════

import { del, get, getPaginated, patch, post } from '../client'
import type {
  AdminQuestion,
  AdminQuestionListItem,
  AnswerType,
  QuestionModule,
  QuestionReviewEntry,
  QuestionSource,
} from '@/types'

export interface AdminQuestionListParams {
  status?: string
  module?: QuestionModule
  category?: string
  difficulty?: number
  tag?: string
  search?: string
  cursor?: string
}

export interface ChoiceInput {
  label: string
  text: string
  imageUrl?: string | null
  sortOrder?: number
}

export interface QuestionWritePayload {
  module: QuestionModule
  category: string // category id
  difficulty: number
  answerType: AnswerType
  hasMath?: boolean
  stem: string
  passage?: string | null
  correctAnswer: string
  explanation?: string | null
  source?: QuestionSource
  sourceRef?: string | null
  tags?: string[] // tag ids
  choices?: ChoiceInput[]
}

export const adminQuestionsAPI = {
  list: (params?: AdminQuestionListParams) =>
    getPaginated<AdminQuestionListItem>('/admin/questions/', params),

  get: (id: string) => get<AdminQuestion>(`/admin/questions/${id}/`),

  create: (payload: QuestionWritePayload) => post<AdminQuestion>('/admin/questions/', payload),

  update: (id: string, payload: Partial<QuestionWritePayload>) =>
    patch<AdminQuestion>(`/admin/questions/${id}/`, payload),

  remove: (id: string) => del<void>(`/admin/questions/${id}/`),

  // Lifecycle
  submit: (id: string) => post<AdminQuestion>(`/admin/questions/${id}/submit-for-review/`),
  approve: (id: string) => post<AdminQuestion>(`/admin/questions/${id}/approve/`),
  reject: (id: string, note: string) =>
    post<AdminQuestion>(`/admin/questions/${id}/reject/`, { note }),

  reviews: (id: string) => get<QuestionReviewEntry[]>(`/admin/questions/${id}/reviews/`),
}
