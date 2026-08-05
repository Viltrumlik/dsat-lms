// ═══════════════════════════════════════
// DSAT LMS v2 — Question Bank API
// Domain: Question Bank
// Description: Public browsing of published questions — cursor-paginated list
//   with filters/search, study detail, and category/tag lists for filter UIs.
// ═══════════════════════════════════════

import { get, getPaginated, post, cursorFromUrl } from './client'
import type {
  AnswerType,
  QuestionCategory,
  QuestionDetail,
  QuestionListItem,
  QuestionModule,
  QuestionTag,
  SessionDetail,
} from '@/types'

// Re-exported for existing imports; canonical home is client.ts.
export { cursorFromUrl }

export interface QuestionListParams {
  module?: QuestionModule
  difficulty?: number
  difficultyMin?: number
  difficultyMax?: number
  /** easy / medium / hard over the stored 1–5. Repeatable. */
  band?: DifficultyBand[]
  /** A DOMAIN here means everything under it, not just questions tagged with
   *  the domain itself (which is nothing — questions are tagged with skills). */
  category?: string
  /** Answered by me, or not yet. Account-wide. */
  status?: 'done' | 'todo'
  tag?: string // slug
  answerType?: AnswerType
  hasMath?: boolean
  source?: string
  search?: string
  cursor?: string
}

export type DifficultyBand = 'easy' | 'medium' | 'hard'

/** One row of the drill picker: a category with what's in it and what's done. */
export interface PracticeCategory {
  id: string
  module: QuestionModule
  name: string
  parent: string | null
  total: number
  done: number
  correct: number
  easy: number
  medium: number
  hard: number
}

export interface PracticeOptions {
  categories: PracticeCategory[]
  totalQuestions: number
  doneQuestions: number
  correctQuestions: number
  maxQuestions: number
}

export interface PracticeSelection {
  categories: string[]
  difficulties: DifficultyBand[]
  excludeDone: boolean
  limit?: number
  /** instant marks each answer as it is given; exam withholds until submit. */
  mode?: 'instant' | 'exam'
}

export const questionAPI = {
  /** Cursor-paginated, newest-first. Returns `{ data, pagination }`. */
  list: (params?: QuestionListParams) =>
    getPaginated<QuestionListItem>('/questions/', params),

  /** Full study view — choices, correct answer, explanation. */
  get: (id: string) => get<QuestionDetail>(`/questions/${id}/`),

  /** Category tree for filter UIs (unpaginated). */
  categories: (params?: { module?: QuestionModule; parent?: string }) =>
    get<QuestionCategory[]>('/questions/categories/', params),

  /** All tags (unpaginated). */
  tags: () => get<QuestionTag[]>('/questions/tags/'),

  /** Everything the drill picker renders — tree, counts, caps. */
  practiceOptions: () => get<PracticeOptions>('/questions/practice/options/'),

  /** How many questions the current ticks would yield. */
  practicePreview: (selection: PracticeSelection) =>
    post<{ matching: number; willUse: number }>('/questions/practice/preview/', selection),

  /** Build the set and open the session on it. */
  practiceStart: (selection: PracticeSelection) =>
    post<SessionDetail & { questionCount: number }>('/questions/practice/start/', selection),
}
