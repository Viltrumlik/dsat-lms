// ═══════════════════════════════════════
// DSAT LMS v2 — Question Bank API
// Domain: Question Bank
// Description: Public browsing of published questions — cursor-paginated list
//   with filters/search, study detail, and category/tag lists for filter UIs.
// ═══════════════════════════════════════

import { get, getPaginated } from './client'
import type {
  AnswerType,
  QuestionCategory,
  QuestionDetail,
  QuestionListItem,
  QuestionModule,
  QuestionTag,
} from '@/types'

export interface QuestionListParams {
  module?: QuestionModule
  difficulty?: number
  difficultyMin?: number
  difficultyMax?: number
  category?: string
  tag?: string // slug
  answerType?: AnswerType
  hasMath?: boolean
  source?: string
  search?: string
  cursor?: string
}

/** Pull the opaque `cursor` value out of a DRF "next"/"previous" page URL. */
export function cursorFromUrl(url: string | null): string | null {
  if (!url) return null
  try {
    return new URL(url).searchParams.get('cursor')
  } catch {
    return null
  }
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
}
