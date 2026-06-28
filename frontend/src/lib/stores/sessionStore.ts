// ═══════════════════════════════════════
// DSAT LMS v2 — Session Store (Zustand)
// Domain: Test Engine
// Description: Aktiv test sessiyasining butun state'i
//
// Bu store faqat test engine uchun.
// Boshqa hamma narsa TanStack Query + React Context.
// ═══════════════════════════════════════

import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { SessionQuestion, EngineSection, QuestionClientState, ExamType } from '@/types'

// ─────────────────────────────────────
// Types
// ─────────────────────────────────────

export type SessionStatus = 'idle' | 'loading' | 'active' | 'break' | 'review' | 'submitting' | 'submitted'

interface SessionMeta {
  sessionId: string
  examId: string
  examTitle: string
  examType: ExamType
  assignmentId: string | null
}

interface SessionState {
  // Meta
  meta: SessionMeta | null
  status: SessionStatus

  // Structure
  sections: EngineSection[]
  currentSectionIndex: number  // 0-based
  currentQuestionIndex: number // 0-based (within section)

  // Timer
  timeRemaining: number | null  // seconds for current section
  isTimerRunning: boolean

  // Per-question client state
  questionStates: Record<string, QuestionClientState>

  // ─────────────────────────────────────
  // Actions
  // ─────────────────────────────────────

  // Initialize
  initSession: (meta: SessionMeta, sections: EngineSection[], savedState?: Partial<SessionState>) => void
  resetSession: () => void

  // Navigation
  navigateTo: (sectionIndex: number, questionIndex: number) => void
  nextQuestion: () => void
  prevQuestion: () => void
  goToReview: () => void
  goToBreak: () => void

  // Answer
  setAnswer: (questionId: string, answer: string | null) => void
  toggleFlag: (questionId: string) => void
  toggleCrossOut: (questionId: string, label: 'A' | 'B' | 'C' | 'D') => void
  setNote: (questionId: string, note: string) => void
  setHighlight: (questionId: string, highlight: QuestionClientState['highlight']) => void

  // Timer
  setTimeRemaining: (seconds: number) => void
  tickTimer: () => void
  pauseTimer: () => void
  resumeTimer: () => void

  // Status
  setStatus: (status: SessionStatus) => void
}

// ─────────────────────────────────────
// Default question state
// ─────────────────────────────────────

const defaultQuestionState = (): QuestionClientState => ({
  answer: null,
  flagged: false,
  note: '',
  crossedOut: [],
  highlight: null,
})

// ─────────────────────────────────────
// Store
// ─────────────────────────────────────

export const useSessionStore = create<SessionState>()(
  persist(
    (set, get) => ({
      // Initial state
      meta: null,
      status: 'idle',
      sections: [],
      currentSectionIndex: 0,
      currentQuestionIndex: 0,
      timeRemaining: null,
      isTimerRunning: false,
      questionStates: {},

      // ─────────────────────────────────────
      // Initialize
      // ─────────────────────────────────────

      initSession: (meta, sections, savedState) => {
        set({
          meta,
          sections,
          status: 'active',
          isTimerRunning: true,
          currentSectionIndex: savedState?.currentSectionIndex ?? 0,
          currentQuestionIndex: savedState?.currentQuestionIndex ?? 0,
          timeRemaining: savedState?.timeRemaining ?? null,
          questionStates: savedState?.questionStates ?? {},
        })
      },

      resetSession: () => {
        set({
          meta: null,
          status: 'idle',
          sections: [],
          currentSectionIndex: 0,
          currentQuestionIndex: 0,
          timeRemaining: null,
          isTimerRunning: false,
          questionStates: {},
        })
      },

      // ─────────────────────────────────────
      // Navigation
      // ─────────────────────────────────────

      navigateTo: (sectionIndex, questionIndex) => {
        set({ currentSectionIndex: sectionIndex, currentQuestionIndex: questionIndex })
      },

      nextQuestion: () => {
        const { sections, currentSectionIndex, currentQuestionIndex } = get()
        const currentSection = sections[currentSectionIndex]

        if (!currentSection) return

        if (currentQuestionIndex < currentSection.questions.length - 1) {
          // Same section, next question
          set({ currentQuestionIndex: currentQuestionIndex + 1 })
        } else if (currentSectionIndex < sections.length - 1) {
          // Next section, first question
          // Break screen ko'rsatish kerak — status o'zgartiring
          set({ status: 'break' })
        } else {
          // Oxirgi savol — review'ga o'ting
          set({ status: 'review' })
        }
      },

      prevQuestion: () => {
        const { currentQuestionIndex } = get()
        if (currentQuestionIndex > 0) {
          set({ currentQuestionIndex: currentQuestionIndex - 1 })
        }
      },

      goToReview: () => set({ status: 'review' }),

      goToBreak: () => set({ status: 'break' }),

      // ─────────────────────────────────────
      // Answer & Annotations
      // ─────────────────────────────────────

      setAnswer: (questionId, answer) => {
        const { questionStates } = get()
        set({
          questionStates: {
            ...questionStates,
            [questionId]: {
              ...(questionStates[questionId] ?? defaultQuestionState()),
              answer,
            },
          },
        })
      },

      toggleFlag: (questionId) => {
        const { questionStates } = get()
        const current = questionStates[questionId] ?? defaultQuestionState()
        set({
          questionStates: {
            ...questionStates,
            [questionId]: { ...current, flagged: !current.flagged },
          },
        })
      },

      toggleCrossOut: (questionId, label) => {
        const { questionStates } = get()
        const current = questionStates[questionId] ?? defaultQuestionState()
        const crossedOut = current.crossedOut.includes(label)
          ? current.crossedOut.filter((l) => l !== label)
          : [...current.crossedOut, label]
        set({
          questionStates: {
            ...questionStates,
            [questionId]: { ...current, crossedOut },
          },
        })
      },

      setNote: (questionId, note) => {
        const { questionStates } = get()
        const current = questionStates[questionId] ?? defaultQuestionState()
        set({
          questionStates: {
            ...questionStates,
            [questionId]: { ...current, note },
          },
        })
      },

      setHighlight: (questionId, highlight) => {
        const { questionStates } = get()
        const current = questionStates[questionId] ?? defaultQuestionState()
        set({
          questionStates: {
            ...questionStates,
            [questionId]: { ...current, highlight },
          },
        })
      },

      // ─────────────────────────────────────
      // Timer
      // ─────────────────────────────────────

      setTimeRemaining: (seconds) => set({ timeRemaining: seconds }),

      tickTimer: () => {
        const { timeRemaining, isTimerRunning } = get()
        if (!isTimerRunning || timeRemaining === null) return
        if (timeRemaining <= 0) {
          // Time up — auto submit yoki next section
          set({ timeRemaining: 0, isTimerRunning: false })
          return
        }
        set({ timeRemaining: timeRemaining - 1 })
      },

      pauseTimer: () => set({ isTimerRunning: false }),
      resumeTimer: () => set({ isTimerRunning: true }),

      // ─────────────────────────────────────
      // Status
      // ─────────────────────────────────────

      setStatus: (status) => set({ status }),
    }),
    {
      name: 'dsat-session',  // localStorage key
      // Faqat muhim state'ni persist qilamiz
      partialize: (state) => ({
        meta: state.meta,
        currentSectionIndex: state.currentSectionIndex,
        currentQuestionIndex: state.currentQuestionIndex,
        timeRemaining: state.timeRemaining,
        questionStates: state.questionStates,
        // sections server'dan re-fetch qilamiz (versioning uchun)
      }),
    }
  )
)

// ─────────────────────────────────────
// Selectors (computed values)
// ─────────────────────────────────────

export const selectCurrentQuestion = (state: SessionState): SessionQuestion | null => {
  const section = state.sections[state.currentSectionIndex]
  if (!section) return null
  return section.questions[state.currentQuestionIndex] ?? null
}

export const selectCurrentQuestionState = (state: SessionState, questionId: string): QuestionClientState => {
  return state.questionStates[questionId] ?? defaultQuestionState()
}

export const selectSectionProgress = (state: SessionState, sectionIndex: number) => {
  const section = state.sections[sectionIndex]
  if (!section) return { answered: 0, flagged: 0, total: 0 }

  const answered = section.questions.filter(
    (q) => state.questionStates[q.id]?.answer !== null && state.questionStates[q.id]?.answer !== undefined
  ).length
  const flagged = section.questions.filter((q) => state.questionStates[q.id]?.flagged).length

  return { answered, flagged, total: section.questions.length }
}

// Auto-save uchun minimal payload
export const selectAutoSavePayload = (state: SessionState) => ({
  currentSection: state.currentSectionIndex + 1,
  currentQuestion: state.currentQuestionIndex + 1,
  timeRemaining: state.timeRemaining,
  clientSessionData: {
    questions: state.questionStates,
  },
})
