// ═══════════════════════════════════════
// DSAT LMS v2 — Sessions API
// Domain: Test Engine
// Description: Exam-session lifecycle. Matches the live backend:
//   start body = { exam }; autosave fields = current_section/current_question/
//   time_remaining/client_session_data; answer = { question, chosen_answer };
//   result path = /sessions/:id/result/ (singular); submit + result return ExamResult.
//   (camelCase here ⇄ snake_case on the wire via the client.ts transform.)
// ═══════════════════════════════════════

import { get, post, patch, getPaginated } from './client'
import type {
  ClientSessionData,
  ExamResult,
  Pagination,
  SessionDetail,
  SessionListItem,
  SessionResponse,
} from '@/types'

export interface AutoSavePayload {
  // current_section is sent ONLY on a forward section transition (BreakScreen);
  // the periodic autosave omits it so a cross-section review jump can't move the
  // server section backward and reset its clock. time_remaining is never sent —
  // the server clock is authoritative. (See selectAutoSavePayload.)
  currentSection?: number
  currentQuestion: number
  timeRemaining?: number | null
  clientSessionData: ClientSessionData
}

export interface AnswerPayload {
  question: string
  chosenAnswer: string
  timeSpent?: number
}

export const sessionAPI = {
  /** Start a new session for an exam template. */
  start: (examId: string) => post<SessionDetail>('/sessions/', { exam: examId }),

  /** Full session-detail (recovery / load). */
  get: (sessionId: string) => get<SessionDetail>(`/sessions/${sessionId}/`),

  /** Session history (newest first, cursor-paginated). */
  list: (): Promise<{ data: SessionListItem[]; pagination?: Pagination }> =>
    getPaginated<SessionListItem>('/sessions/'),

  /** Auto-save navigation + client state. Returns the refreshed session. */
  autoSave: (sessionId: string, payload: AutoSavePayload) =>
    patch<SessionDetail>(`/sessions/${sessionId}/`, payload),

  /** Persist a single answer. */
  answer: (sessionId: string, payload: AnswerPayload) =>
    post<SessionResponse>(`/sessions/${sessionId}/answer/`, payload),

  pause: (sessionId: string) => post<SessionDetail>(`/sessions/${sessionId}/pause/`),

  resume: (sessionId: string) => post<SessionDetail>(`/sessions/${sessionId}/resume/`),

  /** Submit + grade. Returns the computed result. */
  submit: (sessionId: string) => post<ExamResult>(`/sessions/${sessionId}/submit/`),

  /** Fetch a previously computed result. */
  result: (sessionId: string) => get<ExamResult>(`/sessions/${sessionId}/result/`),
}
