// Domain: Admin (content studio)
// Description: The question draft — one place that owns every authored field,
//   seeds itself from a fetched question, tracks unsaved changes, and builds the
//   write payload. Keeps the editor component about layout, not bookkeeping.
'use client'

import * as React from 'react'
import type { QuestionWritePayload } from '@/lib/api/admin/questions'
import type {
  AdminQuestion,
  AnswerType,
  ChoiceLabel,
  QuestionModule,
  QuestionSource,
} from '@/types'
import { CHOICE_LABELS, type ChoiceDraft, type ChoiceDraftMap } from './ChoicesEditor'

export interface QuestionDraft {
  module: QuestionModule
  categoryId: string
  difficulty: number
  answerType: AnswerType
  hasMath: boolean
  stem: string
  stemImageUrl: string
  passage: string
  passageImageUrl: string
  choices: ChoiceDraftMap
  correctAnswer: string
  explanation: string
  explanationImageUrl: string
  tagIds: string[]
  source: QuestionSource
  sourceRef: string
}

const emptyChoices = (): ChoiceDraftMap => ({
  A: { text: '', imageUrl: '' },
  B: { text: '', imageUrl: '' },
  C: { text: '', imageUrl: '' },
  D: { text: '', imageUrl: '' },
})

export const EMPTY_DRAFT: QuestionDraft = {
  module: 'math',
  categoryId: '',
  difficulty: 3,
  answerType: 'mcq',
  hasMath: false,
  stem: '',
  stemImageUrl: '',
  passage: '',
  passageImageUrl: '',
  choices: emptyChoices(),
  correctAnswer: '',
  explanation: '',
  explanationImageUrl: '',
  tagIds: [],
  source: 'custom',
  sourceRef: '',
}

export function draftFromQuestion(q: AdminQuestion): QuestionDraft {
  const choices = emptyChoices()
  for (const c of q.choices) {
    if (c.label in choices) {
      choices[c.label as ChoiceLabel] = { text: c.text, imageUrl: c.imageUrl ?? '' }
    }
  }
  return {
    module: q.module,
    categoryId: q.category.id,
    difficulty: q.difficulty,
    answerType: q.answerType,
    hasMath: q.hasMath,
    stem: q.stem,
    stemImageUrl: q.stemImageUrl ?? '',
    passage: q.passage ?? '',
    passageImageUrl: q.passageImageUrl ?? '',
    choices,
    correctAnswer: q.correctAnswer,
    explanation: q.explanation ?? '',
    explanationImageUrl: q.explanationImageUrl ?? '',
    tagIds: q.tags.map((tag) => tag.id),
    source: q.source,
    sourceRef: q.sourceRef ?? '',
  }
}

const orNull = (value: string) => (value.trim() ? value.trim() : null)

export function payloadFromDraft(draft: QuestionDraft): QuestionWritePayload {
  const choices =
    draft.answerType === 'mcq'
      ? CHOICE_LABELS.filter((l) => draft.choices[l].text.trim() !== '').map((l, i) => ({
          label: l,
          text: draft.choices[l].text,
          imageUrl: orNull(draft.choices[l].imageUrl),
          sortOrder: i,
        }))
      : undefined
  return {
    module: draft.module,
    category: draft.categoryId,
    difficulty: draft.difficulty,
    answerType: draft.answerType,
    hasMath: draft.hasMath,
    stem: draft.stem,
    stemImageUrl: orNull(draft.stemImageUrl),
    passage: orNull(draft.passage),
    passageImageUrl: orNull(draft.passageImageUrl),
    correctAnswer: draft.correctAnswer,
    explanation: orNull(draft.explanation),
    explanationImageUrl: orNull(draft.explanationImageUrl),
    choices,
    tags: draft.tagIds,
    source: draft.source,
    sourceRef: orNull(draft.sourceRef),
  }
}

export interface UseQuestionDraft {
  draft: QuestionDraft
  /** Merge a partial update into the draft. */
  patch: (patch: Partial<QuestionDraft>) => void
  patchChoice: (label: ChoiceLabel, patch: Partial<ChoiceDraft>) => void
  /** Replace the whole draft and mark it clean (after a save, or on reset). */
  reset: (next: QuestionDraft) => void
  /** True when the draft differs from the last saved/seeded state. */
  isDirty: boolean
}

export function useQuestionDraft(initial: QuestionDraft = EMPTY_DRAFT): UseQuestionDraft {
  const [draft, setDraft] = React.useState<QuestionDraft>(initial)
  const [baseline, setBaseline] = React.useState<QuestionDraft>(initial)

  const patch = React.useCallback((p: Partial<QuestionDraft>) => {
    setDraft((d) => ({ ...d, ...p }))
  }, [])

  const patchChoice = React.useCallback((label: ChoiceLabel, p: Partial<ChoiceDraft>) => {
    setDraft((d) => ({ ...d, choices: { ...d.choices, [label]: { ...d.choices[label], ...p } } }))
  }, [])

  const reset = React.useCallback((next: QuestionDraft) => {
    setDraft(next)
    setBaseline(next)
  }, [])

  // Cheap structural comparison — the draft is small and flat enough that
  // stringify is far simpler than a hand-rolled deep equal.
  const isDirty = React.useMemo(
    () => JSON.stringify(draft) !== JSON.stringify(baseline),
    [draft, baseline]
  )

  return { draft, patch, patchChoice, reset, isDirty }
}
