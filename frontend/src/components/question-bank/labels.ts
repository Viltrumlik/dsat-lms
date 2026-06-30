// Domain: Question Bank
// Description: Shared i18n key maps + helpers for question metadata. These return
//   dictionary keys (not literal text) so call sites resolve them with useT();
//   module labels reuse the shared `modules.*` namespace.
import type { AnswerType, QuestionModule } from '@/types'

/** Module enum → key in the shared `modules` namespace. */
export const MODULE_LABEL_KEY: Record<QuestionModule, string> = {
  math: 'modules.math',
  reading_writing: 'modules.reading_writing',
}

/** Answer-type enum → key in `questionBank.answerType`. */
export const ANSWER_TYPE_LABEL_KEY: Record<AnswerType, string> = {
  mcq: 'questionBank.answerType.mcq',
  grid_in: 'questionBank.answerType.grid_in',
}

/** 1–5 difficulty → key in `questionBank.difficulty`. */
export const DIFFICULTY_LABEL_KEY: Record<number, string> = {
  1: 'questionBank.difficulty.1',
  2: 'questionBank.difficulty.2',
  3: 'questionBank.difficulty.3',
  4: 'questionBank.difficulty.4',
  5: 'questionBank.difficulty.5',
}

export function moduleBadgeVariant(module: QuestionModule): 'math' | 'rw' {
  return module === 'math' ? 'math' : 'rw'
}
