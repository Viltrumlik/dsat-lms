// Domain: Admin (content studio)
// Description: Word-list authoring — sections, the decks inside them, the words
//   inside those, and the paste import that is how a long list actually gets in.

import { del, get, patch, post } from '../client'
import type { AdminVocabSection, AdminVocabSet, AdminVocabWord } from '@/types'

export interface SectionPayload {
  title?: string
  description?: string
  status?: 'draft' | 'published'
  sortOrder?: number
}

export interface WordPayload {
  word?: string
  definition?: string
  partOfSpeech?: string
  example?: string
  sortOrder?: number
}

export const adminVocabularyAPI = {
  sections: (params?: { search?: string; status?: string }) =>
    get<AdminVocabSection[]>('/admin/vocabulary/sections/', params),
  section: (id: string) => get<AdminVocabSection>(`/admin/vocabulary/sections/${id}/`),
  createSection: (payload: SectionPayload) =>
    post<AdminVocabSection>('/admin/vocabulary/sections/', payload),
  updateSection: (id: string, payload: SectionPayload) =>
    patch<AdminVocabSection>(`/admin/vocabulary/sections/${id}/`, payload),
  deleteSection: (id: string) => del<void>(`/admin/vocabulary/sections/${id}/`),

  sets: (sectionId: string) =>
    get<AdminVocabSet[]>(`/admin/vocabulary/sections/${sectionId}/sets/`),
  createSet: (sectionId: string, title: string) =>
    post<AdminVocabSet>(`/admin/vocabulary/sections/${sectionId}/sets/`, { title }),
  updateSet: (id: string, title: string) =>
    patch<AdminVocabSet>(`/admin/vocabulary/sets/${id}/`, { title }),
  deleteSet: (id: string) => del<void>(`/admin/vocabulary/sets/${id}/`),

  words: (setId: string) => get<AdminVocabWord[]>(`/admin/vocabulary/sets/${setId}/words/`),
  createWord: (setId: string, payload: WordPayload) =>
    post<AdminVocabWord>(`/admin/vocabulary/sets/${setId}/words/`, payload),
  updateWord: (id: string, payload: WordPayload) =>
    patch<AdminVocabWord>(`/admin/vocabulary/words/${id}/`, payload),
  deleteWord: (id: string) => del<void>(`/admin/vocabulary/words/${id}/`),

  /** Paste a list in. Returns how many rows were new (the rest were corrections). */
  importWords: (setId: string, text: string) =>
    post<{ created: number; wordCount: number }>(`/admin/vocabulary/sets/${setId}/import/`, {
      text,
    }),
}
