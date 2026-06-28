import { describe, it, expect, beforeEach } from 'vitest'
import {
  useSessionStore,
  selectAutoSavePayload,
  selectCurrentQuestion,
  selectSectionProgress,
} from './sessionStore'
import type { EngineSection, SessionQuestion } from '@/types'

function q(id: string): SessionQuestion {
  return {
    id,
    module: 'math',
    stem: `stem ${id}`,
    stemImageUrl: null,
    passage: null,
    passageImageUrl: null,
    answerType: 'mcq',
    hasMath: false,
    choices: [
      { label: 'A', text: 'a', imageUrl: null, sortOrder: 0 },
      { label: 'B', text: 'b', imageUrl: null, sortOrder: 1 },
    ],
  }
}

const sections: EngineSection[] = [
  { sectionNumber: 1, title: 'RW', module: 'reading_writing', timeLimit: null, questions: [q('q1'), q('q2')] },
  { sectionNumber: 2, title: 'Math', module: 'math', timeLimit: null, questions: [q('q3')] },
]

const meta = {
  sessionId: 's1',
  examId: 'e1',
  examTitle: 'Demo',
  examType: 'practice' as const,
  assignmentId: null,
}

describe('sessionStore', () => {
  beforeEach(() => {
    useSessionStore.getState().resetSession()
    useSessionStore.getState().initSession(meta, sections, { timeRemaining: 900 })
  })

  it('initializes active with timer', () => {
    const s = useSessionStore.getState()
    expect(s.status).toBe('active')
    expect(s.timeRemaining).toBe(900)
    expect(selectCurrentQuestion(s)?.id).toBe('q1')
  })

  it('records answers, flags, and cross-outs per question', () => {
    const { setAnswer, toggleFlag, toggleCrossOut } = useSessionStore.getState()
    setAnswer('q1', 'B')
    toggleFlag('q1')
    toggleCrossOut('q1', 'A')
    toggleCrossOut('q1', 'C')
    toggleCrossOut('q1', 'A') // toggle off
    const qs = useSessionStore.getState().questionStates['q1']
    expect(qs.answer).toBe('B')
    expect(qs.flagged).toBe(true)
    expect(qs.crossedOut).toEqual(['C'])
  })

  it('moves to break at the end of a section, review at the very end', () => {
    const store = useSessionStore.getState()
    // q1 -> q2 (same section)
    store.nextQuestion()
    expect(useSessionStore.getState().currentQuestionIndex).toBe(1)
    // q2 is last in section 1 -> break
    store.nextQuestion()
    expect(useSessionStore.getState().status).toBe('break')
    // advance into section 2, then off the end -> review
    useSessionStore.getState().navigateTo(1, 0)
    useSessionStore.getState().setStatus('active')
    useSessionStore.getState().nextQuestion()
    expect(useSessionStore.getState().status).toBe('review')
  })

  it('builds a 1-indexed autosave payload', () => {
    useSessionStore.getState().navigateTo(1, 0)
    useSessionStore.getState().setAnswer('q3', 'A')
    const payload = selectAutoSavePayload(useSessionStore.getState())
    expect(payload.currentSection).toBe(2)
    expect(payload.currentQuestion).toBe(1)
    // time_remaining is intentionally NOT sent (server-authoritative clock).
    expect('timeRemaining' in payload).toBe(false)
    expect(payload.clientSessionData.questions.q3.answer).toBe('A')
  })

  it('computes section progress', () => {
    useSessionStore.getState().setAnswer('q1', 'A')
    useSessionStore.getState().toggleFlag('q2')
    const progress = selectSectionProgress(useSessionStore.getState(), 0)
    expect(progress).toEqual({ answered: 1, flagged: 1, total: 2 })
  })
})
