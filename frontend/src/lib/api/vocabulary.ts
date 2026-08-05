// Domain: Vocabulary
// Description: Student word lists + flashcard runs.
//   Verdicts are reported as the student goes (`report`) and the run is closed
//   separately (`finish`) — quitting halfway must keep the progress without
//   claiming the deck was cleared.

import { get, post } from './client'
import type {
  VocabResult,
  VocabSection,
  VocabSectionDetail,
  VocabSetDetail,
  VocabStudySession,
  VocabWord,
} from '@/types'

export const vocabularyAPI = {
  sections: () => get<VocabSection[]>('/vocabulary/sections/'),
  section: (id: string) => get<VocabSectionDetail>(`/vocabulary/sections/${id}/`),
  set: (id: string) => get<VocabSetDetail>(`/vocabulary/sets/${id}/`),
  /** Every word still in Learning, across every list. */
  learning: () => get<VocabWord[]>('/vocabulary/learning/'),

  start: (vocabSet: string) => post<VocabStudySession>('/vocabulary/sessions/', { vocabSet }),
  report: (sessionId: string, results: VocabResult[]) =>
    post<VocabStudySession>(`/vocabulary/sessions/${sessionId}/report/`, { results }),
  finish: (sessionId: string) =>
    post<VocabStudySession>(`/vocabulary/sessions/${sessionId}/finish/`),
}
