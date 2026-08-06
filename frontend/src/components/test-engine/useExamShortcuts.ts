// Domain: Test Engine
// Description: Keyboard shortcuts for the exam surface — arrows to navigate,
//   A–D to answer, M to mark for review. Disabled while typing.
'use client'

import * as React from 'react'
import {
  useSessionStore,
  selectCurrentQuestion,
} from '@/lib/stores/sessionStore'
import { queueAnswer } from '@/lib/hooks/useAnswerSync'
import type { ChoiceLabel } from '@/types'

const CHOICE_KEYS: ChoiceLabel[] = ['A', 'B', 'C', 'D']

function isTyping(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null
  if (!el) return false
  const tag = el.tagName
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable) return true
  // Anything inside the calculator. Desmos handles its own keyboard, and a
  // student typing "c" into an expression means the variable, not choice C.
  return typeof el.closest === 'function' && el.closest('[data-exam-calculator]') !== null
}

export function useExamShortcuts({ enabled }: { enabled: boolean }) {
  React.useEffect(() => {
    if (!enabled) return

    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || isTyping(e.target)) return

      const state = useSessionStore.getState()
      const question = selectCurrentQuestion(state)
      if (!question) return

      if (e.key === 'ArrowRight') {
        e.preventDefault()
        state.nextQuestion()
        return
      }
      if (e.key === 'ArrowLeft') {
        e.preventDefault()
        state.prevQuestion()
        return
      }
      if (e.key === 'm' || e.key === 'M') {
        e.preventDefault()
        state.toggleFlag(question.id)
        return
      }

      if (question.answerType !== 'mcq') return
      const label = e.key.toUpperCase() as ChoiceLabel
      if (!CHOICE_KEYS.includes(label)) return
      if (!question.choices.some((c) => c.label === label)) return

      e.preventDefault()
      // Selecting a struck choice restores it, matching the click path.
      if (state.questionStates[question.id]?.crossedOut?.includes(label)) {
        state.toggleCrossOut(question.id, label)
      }
      state.setAnswer(question.id, label)
      if (state.meta) queueAnswer(state.meta.sessionId, question.id, label)
    }

    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [enabled])
}
