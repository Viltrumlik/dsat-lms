// Domain: Question Bank
// Description: Shared display labels + helpers for question metadata.
import type { AnswerType, QuestionModule } from '@/types'

export const MODULE_LABEL: Record<QuestionModule, string> = {
  math: 'Math',
  reading_writing: 'Reading & Writing',
}

export const ANSWER_TYPE_LABEL: Record<AnswerType, string> = {
  mcq: 'Multiple choice',
  grid_in: 'Grid-in',
}

/** 1–5 difficulty → human label. */
export const DIFFICULTY_LABEL: Record<number, string> = {
  1: 'Very easy',
  2: 'Easy',
  3: 'Medium',
  4: 'Hard',
  5: 'Very hard',
}

export function moduleBadgeVariant(module: QuestionModule): 'math' | 'rw' {
  return module === 'math' ? 'math' : 'rw'
}
