// ═══════════════════════════════════════
// DSAT LMS v2 — Core TypeScript Types
// Domain: All
// Description: Frontend types. These mirror the backend serializers AFTER the
//   client.ts snake→camel transform. Backend fields are snake_case on the wire;
//   here they are camelCase. Decimal fields (accuracy, percentile, scores) may
//   arrive as strings (DRF coerces Decimal→string) — use `num()` to read them.
// ═══════════════════════════════════════

// ─────────────────────────────────────
// API Response Wrappers
// ─────────────────────────────────────

export interface Pagination {
  count: number | null
  next: string | null
  previous: string | null
}

export interface APISuccess<T> {
  success: true
  data: T
  meta?: {
    pagination?: Pagination
  }
}

export interface APIError {
  success: false
  error: {
    code: string
    message: string
    field?: string | null
    fields?: Record<string, string[]>
  }
}

export type APIResponse<T> = APISuccess<T> | APIError

/** A decimal field that DRF may serialize as a string. Read via num(). */
export type Decimalish = number | string | null

// ─────────────────────────────────────
// Identity
// ─────────────────────────────────────

export type UserRole = 'public' | 'student' | 'teacher' | 'admin'

export interface User {
  id: string
  email: string
  firstName: string
  lastName: string
  fullName: string
  role: UserRole
  isEmailVerified: boolean
  avatarUrl: string | null
  satTargetScore: number | null
  examDate: string | null // ISO date
  timezone: string
  createdAt: string
}

/** Shape of POST /auth/login and /auth/register `data`. */
export interface AuthSession {
  user: User
  accessToken: string
}

/** Compact user as nested in rosters and homework submissions. */
export interface StudentMini {
  id: string
  email: string
  firstName: string
  lastName: string
  fullName: string
}

// ─────────────────────────────────────
// Question Bank
// ─────────────────────────────────────

export type QuestionModule = 'math' | 'reading_writing'
export type AnswerType = 'mcq' | 'grid_in'
export type ChoiceLabel = 'A' | 'B' | 'C' | 'D'

export interface QuestionCategory {
  id: string
  module: QuestionModule
  name: string
  slug: string
  parent: string | null
  sortOrder: number
}

/** Compact category as nested inside question list/detail. */
export interface QuestionCategoryRef {
  id: string
  name: string
  module: QuestionModule
}

export interface QuestionTag {
  id: string
  name: string
  slug: string
  color: string
}

export interface QuestionChoice {
  label: ChoiceLabel
  text: string
  imageUrl: string | null
  sortOrder: number
}

/** Question list item (browsing) — no correct answer / explanation. */
export interface QuestionListItem {
  id: string
  module: QuestionModule
  category: QuestionCategoryRef
  difficulty: 1 | 2 | 3 | 4 | 5
  answerType: AnswerType
  hasMath: boolean
  stem: string
  tags: string[] // slugs
  version: number
  createdAt: string
}

/** Question detail (study view) — includes answer + explanation. */
export interface QuestionDetail {
  id: string
  module: QuestionModule
  category: QuestionCategoryRef
  difficulty: 1 | 2 | 3 | 4 | 5
  answerType: AnswerType
  hasMath: boolean
  stem: string
  stemImageUrl: string | null
  passage: string | null
  passageImageUrl: string | null
  choices: QuestionChoice[]
  correctAnswer: string
  explanation: string | null
  explanationImageUrl: string | null
  source: 'official' | 'custom' | 'imported'
  sourceRef: string | null
  tags: QuestionTag[]
  version: number
  createdAt: string
}

// ─────────────────────────────────────
// Test Engine / Sessions
// ─────────────────────────────────────

export type ExamType =
  | 'practice'
  | 'past_paper'
  | 'mock'
  | 'midterm'
  | 'assessment'
  | 'homework'

export type ExamModule = 'math' | 'reading_writing' | 'full'
export type SessionStatus = 'in_progress' | 'paused' | 'completed' | 'abandoned'

export type AccessLevel = 'public' | 'academy'

/** Compact exam template nested in session list/detail. */
export interface ExamSummary {
  id: string
  title: string
  type: ExamType
  module: ExamModule
  timeLimit: number | null // minutes
  isAdaptive: boolean
}

/** GET /exams/ — a startable exam template for the dashboard. */
export interface ExamListItem {
  id: string
  type: ExamType
  title: string
  description: string | null
  module: ExamModule
  timeLimit: number | null // minutes
  isAdaptive: boolean
  accessLevel: AccessLevel
  sectionCount: number
  questionCount: number
  createdAt: string
}

/** The question shape returned inside a test session (no answer/explanation). */
export interface SessionQuestion {
  id: string
  module: QuestionModule
  stem: string
  stemImageUrl: string | null
  passage: string | null
  passageImageUrl: string | null
  answerType: AnswerType
  hasMath: boolean
  choices: QuestionChoice[] // empty for grid_in
}

/** Section as returned by the backend (questions wrapped with position). */
export interface SessionSectionRaw {
  sectionNumber: number
  title: string
  module: QuestionModule
  timeLimit: number | null // minutes
  questions: Array<{ position: number; question: SessionQuestion }>
}

/** Flattened section used by the engine store. */
export interface EngineSection {
  sectionNumber: number
  title: string
  module: QuestionModule
  timeLimit: number | null
  questions: SessionQuestion[]
}

export interface SessionResponse {
  question: string
  chosenAnswer: string
  isCorrect: boolean | null
  timeSpent: number | null
  answeredAt: string
}

export interface ClientSessionData {
  questions?: Record<string, QuestionClientState>
}

/** GET /sessions/:id — the full session-detail object. */
export interface SessionDetail {
  id: string
  exam: ExamSummary
  status: SessionStatus
  currentSection: number // 1-indexed
  currentQuestion: number // 1-indexed
  timeRemaining: number | null // seconds
  serverTimeRemaining: number | null // seconds — authoritative
  startedAt: string
  submittedAt: string | null
  clientSessionData: ClientSessionData
  sections: SessionSectionRaw[]
  responses: SessionResponse[]
}

/** GET /sessions/ — history list item. */
export interface SessionListItem {
  id: string
  exam: ExamSummary
  status: SessionStatus
  startedAt: string
  submittedAt: string | null
  createdAt: string
}

// Per-question client state (stored in Zustand + auto-saved)
export interface QuestionClientState {
  answer: string | null
  flagged: boolean
  note: string
  crossedOut: ChoiceLabel[]
  highlight: HighlightData | null
}

export interface HighlightData {
  ranges: Array<{ start: number; end: number; color: string }>
}

// ─────────────────────────────────────
// Results
// ─────────────────────────────────────

export interface CategoryBreakdown {
  name: string
  correct: number
  total: number
  accuracy: Decimalish
}

export interface ExamResult {
  totalScore: number | null
  mathScore: number | null
  rwScore: number | null
  totalCorrect: number
  totalIncorrect: number
  totalSkipped: number
  totalQuestions: number
  accuracyPct: Decimalish
  timeSpentSecs: number
  percentile: Decimalish
  scoreBreakdown: {
    categories: Record<string, CategoryBreakdown>
  }
  computedAt: string
}

// ─────────────────────────────────────
// Analytics
// ─────────────────────────────────────

export interface AnalyticsSummary {
  totalAnswered: number
  totalCorrect: number
  overallAccuracy: number
  examsCompleted: number
  bestExamAccuracy: number | null
}

export interface CategoryProgress {
  category: string
  categoryName: string
  module: QuestionModule
  totalAnswered: number
  totalCorrect: number
  accuracyPct: Decimalish
  lastPracticedAt: string | null
}

export interface RankingEntry {
  rank: number
  name: string
  accuracy: number
  totalAnswered: number
  isMe: boolean
}

// ─────────────────────────────────────
// Homework
// ─────────────────────────────────────

export type HomeworkStatus = 'assigned' | 'submitted' | 'graded'

/** The requesting student's own submission, embedded in homework payloads. */
export interface HomeworkMySubmission {
  status: HomeworkStatus
  submittedAt: string | null
}

export interface Homework {
  id: string
  title: string
  description: string
  assignedClass: string // Class id
  className: string
  exam: string | null // ExamTemplate id — when set, the homework is exam-backed
  examTitle: string | null
  dueAt: string
  isPublished: boolean
  mySubmission: HomeworkMySubmission | null // null for teachers and for students with no submission yet
  createdAt: string
}

/** Submission row (teacher submissions view; also returned by submit). */
export interface HomeworkSubmission {
  id: string
  student: StudentMini
  status: HomeworkStatus
  submittedAt: string | null
  createdAt: string
}

// ─────────────────────────────────────
// Notifications (Phase 2 — kept for reference)
// ─────────────────────────────────────

export type NotificationType =
  | 'homework_assigned'
  | 'homework_due_soon'
  | 'exam_scheduled'
  | 'exam_graded'
  | 'teacher_comment'

export interface Notification {
  id: string
  type: NotificationType
  title: string
  body: string
  data: Record<string, unknown>
  isRead: boolean
  readAt: string | null
  createdAt: string
}
