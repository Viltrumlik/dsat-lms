// ═══════════════════════════════════════
// DSAT LMS v2 — Session loader
// Domain: Test Engine
// Description: Loads a session into the Zustand store. The persist middleware may
//   have rehydrated stale local state; per the engine contract the SERVER wins,
//   so we overwrite navigation/answers/timer from the fetched detail. A paused
//   session is resumed (clock unfrozen) before init. Completed → results.
// ═══════════════════════════════════════

'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { sessionAPI } from '@/lib/api/sessions'
import { resetAnswerQueue } from '@/lib/hooks/useAnswerSync'
import { useSessionStore } from '@/lib/stores/sessionStore'
import type {
  EngineSection,
  QuestionClientState,
  SessionDetail,
  ChoiceLabel,
} from '@/types'

export type SessionLoadState = 'loading' | 'ready' | 'error' | 'redirecting'

function toEngineSections(detail: SessionDetail): EngineSection[] {
  return detail.sections.map((section) => ({
    sectionNumber: section.sectionNumber,
    title: section.title,
    module: section.module,
    timeLimit: section.timeLimit,
    questions: section.questions
      .slice()
      .sort((a, b) => a.position - b.position)
      .map((entry) => entry.question),
  }))
}

function normalizeState(partial: Partial<QuestionClientState> | undefined): QuestionClientState {
  return {
    answer: partial?.answer ?? null,
    flagged: partial?.flagged ?? false,
    note: partial?.note ?? '',
    crossedOut: (partial?.crossedOut as ChoiceLabel[] | undefined) ?? [],
    highlight: partial?.highlight ?? null,
  }
}

function buildQuestionStates(detail: SessionDetail): Record<string, QuestionClientState> {
  const states: Record<string, QuestionClientState> = {}
  const fromClient = detail.clientSessionData?.questions ?? {}
  for (const [id, partial] of Object.entries(fromClient)) {
    states[id] = normalizeState(partial as Partial<QuestionClientState>)
  }
  // Server-recorded answers are authoritative — overlay them.
  for (const response of detail.responses) {
    const existing = states[response.question] ?? normalizeState(undefined)
    states[response.question] = {
      ...existing,
      answer: response.chosenAnswer ? response.chosenAnswer : existing.answer,
    }
  }
  return states
}

export function useSession(sessionId: string): { state: SessionLoadState } {
  const router = useRouter()
  const initSession = useSessionStore((s) => s.initSession)
  const [state, setState] = React.useState<SessionLoadState>('loading')
  const started = React.useRef(false)

  React.useEffect(() => {
    // The ref guards against a duplicate fetch (incl. StrictMode's double-invoke).
    // We intentionally do NOT gate setState on a per-effect "active" flag: with the
    // ref guard, the second StrictMode run is skipped, so an active=false from the
    // first cleanup would otherwise discard the only fetch's result (stuck loading).
    if (started.current) return
    started.current = true
    resetAnswerQueue() // drop any chains from a previous session

    ;(async () => {
      try {
        let detail = await sessionAPI.get(sessionId)

        if (detail.status === 'completed') {
          setState('redirecting')
          router.replace(`/results/${sessionId}`)
          return
        }
        if (detail.status === 'abandoned') {
          setState('error')
          return
        }
        if (detail.status === 'paused') {
          detail = await sessionAPI.resume(sessionId)
        }

        const sections = toEngineSections(detail)
        const lastSectionIdx = Math.max(0, sections.length - 1)
        const sectionIdx = Math.min(Math.max(0, detail.currentSection - 1), lastSectionIdx)
        const questionCount = sections[sectionIdx]?.questions.length ?? 1
        const questionIdx = Math.min(Math.max(0, detail.currentQuestion - 1), Math.max(0, questionCount - 1))

        initSession(
          {
            sessionId: detail.id,
            examId: detail.exam.id,
            examTitle: detail.exam.title,
            examType: detail.exam.type,
            assignmentId: null,
          },
          sections,
          {
            currentSectionIndex: sectionIdx,
            currentQuestionIndex: questionIdx,
            timeRemaining: detail.serverTimeRemaining ?? detail.timeRemaining ?? null,
            questionStates: buildQuestionStates(detail),
          }
        )
        setState('ready')
      } catch {
        setState('error')
      }
    })()
  }, [sessionId, initSession, router])

  return { state }
}
