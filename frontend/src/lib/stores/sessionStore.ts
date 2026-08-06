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
import type {
  SessionQuestion,
  EngineSection,
  QuestionClientState,
  ExamType,
  FeedbackMode,
  Annotation,
} from '@/types'

// ─────────────────────────────────────
// Types
// ─────────────────────────────────────

export type SessionStatus = 'idle' | 'loading' | 'active' | 'break' | 'review' | 'submitting' | 'submitted'

interface SessionMeta {
  sessionId: string
  examId: string
  examTitle: string
  examType: ExamType
  /** Whether the clock may be stopped. The server refuses pause on invigilated
   *  papers, so the engine must not offer it there either. */
  allowPause: boolean
  /** Sat in full screen — the runner gates the paper behind a Begin screen. */
  requiresFullscreen: boolean
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
  // Bluebook exam-surface preferences (session-scoped, persisted locally)
  // ─────────────────────────────────────
  /** "ABC" answer-eliminator mode — shows the cross-out column. */
  eliminatorOn: boolean
  /** Timer collapsed via the "Hide" pill. */
  timerHidden: boolean
  /** Split-pane divider position, as a fraction of the body width. */
  splitRatio: number
  /** Highlights & Notes rail open. */
  notesOpen: boolean
  /** The Desmos calculator window. */
  calculatorOpen: boolean
  /** Which calculator it is showing. Both stay alive behind the tabs, so a
   *  graph you drew is still there when you come back from the scientific. */
  calculatorTab: 'graphing' | 'scientific'

  // ─────────────────────────────────────
  // Actions
  // ─────────────────────────────────────

  // Initialize
  initSession: (meta: SessionMeta, sections: EngineSection[], savedState?: Partial<SessionState>) => void
  resetSession: () => void

  /** Fill in a module the server has just handed over.
   *  The paper arrives one module at a time, so the section the student is
   *  walking into has to be merged in before they walk. */
  loadSections: (sections: EngineSection[]) => void

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

  // Annotations (Highlights & Notes)
  addAnnotation: (questionId: string, annotation: Annotation) => void
  updateAnnotation: (questionId: string, id: string, patch: Partial<Annotation>) => void
  removeAnnotation: (questionId: string, id: string) => void

  // Exam-surface preferences
  toggleEliminator: () => void
  toggleTimerHidden: () => void
  setSplitRatio: (ratio: number) => void
  setNotesOpen: (open: boolean) => void
  setCalculatorOpen: (open: boolean) => void
  setCalculatorTab: (tab: 'graphing' | 'scientific') => void

  /** How this session marks answers. Fixed by the server at start; the client
   *  only reads it to decide whether to render the verdict. */
  feedbackMode: FeedbackMode
  /** Per-question server verdicts on an instant-feedback drill. Empty on a paper. */
  verdicts: Record<string, { isCorrect: boolean; correctAnswer: string }>
  setVerdict: (questionId: string, verdict: { isCorrect: boolean; correctAnswer: string }) => void

  // Timer
  setTimeRemaining: (seconds: number) => void
  /** Adopt the server's clock (downward only) — see the implementation. */
  syncServerTime: (seconds: number | null) => void
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
  annotations: [],
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
      feedbackMode: 'none',
      verdicts: {},
      questionStates: {},
      eliminatorOn: false,
      timerHidden: false,
      splitRatio: 0.5,
      notesOpen: false,
      calculatorOpen: false,
      calculatorTab: 'graphing',

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
          feedbackMode: savedState?.feedbackMode ?? 'none',
          // Verdicts are server truth for this run; never carried over.
          verdicts: {},
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
          feedbackMode: 'none',
          verdicts: {},
          questionStates: {},
          eliminatorOn: false,
          timerHidden: false,
          splitRatio: 0.5,
          notesOpen: false,
          calculatorOpen: false,
          calculatorTab: 'graphing',
        })
      },

      // ─────────────────────────────────────
      // Navigation
      // ─────────────────────────────────────

      loadSections: (incoming) => {
        // Keep whatever we already hold: an earlier module comes back EMPTY
        // once it is closed, and dropping its questions would break the
        // answered-count and the store's own view of the paper.
        const held = get().sections
        set({
          sections: incoming.map((section, index) => {
            const before = held[index]
            if (section.questions.length > 0 || !before) return section
            return { ...section, questions: before.questions }
          }),
        })
      },

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
      // Annotations (Highlights & Notes)
      // ─────────────────────────────────────

      addAnnotation: (questionId, annotation) => {
        const { questionStates } = get()
        const current = questionStates[questionId] ?? defaultQuestionState()
        set({
          questionStates: {
            ...questionStates,
            [questionId]: {
              ...current,
              annotations: [...(current.annotations ?? []), annotation],
            },
          },
        })
      },

      updateAnnotation: (questionId, id, patch) => {
        const { questionStates } = get()
        const current = questionStates[questionId] ?? defaultQuestionState()
        set({
          questionStates: {
            ...questionStates,
            [questionId]: {
              ...current,
              annotations: (current.annotations ?? []).map((a) =>
                a.id === id ? { ...a, ...patch } : a
              ),
            },
          },
        })
      },

      removeAnnotation: (questionId, id) => {
        const { questionStates } = get()
        const current = questionStates[questionId] ?? defaultQuestionState()
        set({
          questionStates: {
            ...questionStates,
            [questionId]: {
              ...current,
              annotations: (current.annotations ?? []).filter((a) => a.id !== id),
            },
          },
        })
      },

      // ─────────────────────────────────────
      // Exam-surface preferences
      // ─────────────────────────────────────

      toggleEliminator: () => set({ eliminatorOn: !get().eliminatorOn }),
      toggleTimerHidden: () => set({ timerHidden: !get().timerHidden }),
      setSplitRatio: (ratio) => set({ splitRatio: Math.min(0.8, Math.max(0.2, ratio)) }),
      setNotesOpen: (open) => set({ notesOpen: open }),
      setCalculatorOpen: (open) => set({ calculatorOpen: open }),
      setCalculatorTab: (tab) => set({ calculatorTab: tab }),

      // ─────────────────────────────────────
      // Timer
      // ─────────────────────────────────────

      setVerdict: (questionId, verdict) =>
        set((state) => ({ verdicts: { ...state.verdicts, [questionId]: verdict } })),

      setTimeRemaining: (seconds) => set({ timeRemaining: seconds }),

      /**
       * Re-seat the countdown on the server's figure.
       *
       * The local countdown is a setInterval, and browsers throttle those hard
       * in a hidden tab — so a student who tabs away comes back with a clock
       * that ran slow and shows them time they no longer have. Every server
       * reply carries the real number; this adopts it. Only ever DOWNWARD, so a
       * late or reordered response can't hand time back.
       */
      syncServerTime: (seconds) => {
        if (seconds === null) return
        const { timeRemaining } = get()
        if (timeRemaining === null || seconds < timeRemaining) {
          set({ timeRemaining: Math.max(0, seconds) })
        }
      },

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
        eliminatorOn: state.eliminatorOn,
        timerHidden: state.timerHidden,
        splitRatio: state.splitRatio,
        notesOpen: state.notesOpen,
        calculatorOpen: state.calculatorOpen,
        calculatorTab: state.calculatorTab,
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

/** Annotations for the current question, always an array. */
export const selectCurrentAnnotations = (state: SessionState): Annotation[] => {
  const question = selectCurrentQuestion(state)
  if (!question) return EMPTY_ANNOTATIONS
  return state.questionStates[question.id]?.annotations ?? EMPTY_ANNOTATIONS
}

// Stable identity — a fresh [] on every read would loop useSyncExternalStore.
const EMPTY_ANNOTATIONS: Annotation[] = []

export const selectSectionProgress = (state: SessionState, sectionIndex: number) => {
  const section = state.sections[sectionIndex]
  if (!section) return { answered: 0, flagged: 0, total: 0 }

  const answered = section.questions.filter(
    (q) => state.questionStates[q.id]?.answer !== null && state.questionStates[q.id]?.answer !== undefined
  ).length
  const flagged = section.questions.filter((q) => state.questionStates[q.id]?.flagged).length

  return { answered, flagged, total: section.questions.length }
}

// Auto-save uchun minimal payload.
// NOTE: neither time_remaining NOR current_section is sent.
//  - time_remaining: the timer is server-authoritative (computed from started_at);
//    the client value is briefly stale right after load, which tripped the server's
//    cheat-check and rejected the whole save, losing flag/note/cross-out state.
//  - current_section: the backend resets section_started_at on ANY section change,
//    so an autosave carrying a *lower* section (e.g. a cross-section review jump)
//    would hand the user a fresh section clock. Section advances are therefore
//    forward-only and persisted explicitly by the section transition (BreakScreen).
export const selectAutoSavePayload = (state: SessionState) => ({
  currentQuestion: state.currentQuestionIndex + 1,
  clientSessionData: {
    questions: state.questionStates,
  },
})
