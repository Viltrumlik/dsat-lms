// ═══════════════════════════════════════
// DSAT LMS v2 — Answer sync
// Domain: Test Engine
// Description: Persists answers to POST /sessions/:id/answer/ (the row grading
//   reads). Writes are SERIALIZED per question via a promise chain so the latest
//   value always lands last — the backend answer endpoint is last-write-wins
//   (update_or_create), so an un-ordered slower write (e.g. "A" sent before "B")
//   could otherwise overwrite the final answer and corrupt the score. The submit
//   flow queues the final value for every answered question and awaits the whole
//   queue (flushAnswers) before grading.
// ═══════════════════════════════════════

'use client'

import * as React from 'react'
import { sessionAPI } from '@/lib/api/sessions'
import { useSessionStore } from '@/lib/stores/sessionStore'

// Per-question write chains. Module-level: only one session is active at a time
// (cleared on load via resetAnswerQueue).
const chains = new Map<string, Promise<unknown>>()

/** Enqueue an answer write, ordered after any in-flight write for the same question. */
export function queueAnswer(sessionId: string, question: string, chosenAnswer: string) {
  const prev = chains.get(question) ?? Promise.resolve()
  const next = prev
    .catch(() => {})
    .then(() => sessionAPI.answer(sessionId, { question, chosenAnswer }).catch(() => {}))
  chains.set(question, next)
  return next
}

/** Await every outstanding answer write (call before submitting/grading). */
export async function flushAnswers(): Promise<void> {
  await Promise.allSettled([...chains.values()])
}

/** Drop all pending chains — call when a new session loads. */
export function resetAnswerQueue(): void {
  chains.clear()
}

export function useAnswerSync() {
  const sessionId = useSessionStore((s) => s.meta?.sessionId)

  return React.useCallback(
    (question: string, chosenAnswer: string) => {
      if (!sessionId) return
      queueAnswer(sessionId, question, chosenAnswer)
    },
    [sessionId]
  )
}
