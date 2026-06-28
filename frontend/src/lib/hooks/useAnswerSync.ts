// ═══════════════════════════════════════
// DSAT LMS v2 — Answer sync
// Domain: Test Engine
// Description: Persists answers to POST /sessions/:id/answer/ (the row grading
//   reads). Best-effort during the test; the submit flow reconciles all answers
//   before grading so a dropped POST never loses a graded answer.
// ═══════════════════════════════════════

'use client'

import * as React from 'react'
import { sessionAPI } from '@/lib/api/sessions'
import { useSessionStore } from '@/lib/stores/sessionStore'

export function useAnswerSync() {
  const sessionId = useSessionStore((s) => s.meta?.sessionId)

  return React.useCallback(
    (question: string, chosenAnswer: string) => {
      if (!sessionId) return
      sessionAPI.answer(sessionId, { question, chosenAnswer }).catch(() => {
        // best-effort; reconciled on submit
      })
    },
    [sessionId]
  )
}
