// ═══════════════════════════════════════
// DSAT LMS v2 — Core TypeScript Types
// Domain: All
// ═══════════════════════════════════════

// ─────────────────────────────────────
// API Response Wrappers
// ─────────────────────────────────────

export interface APISuccess<T> {
  success: true
  data: T
  meta?: {
    pagination?: {
      count: number | null
      next: string | null
      previous: string | null
    }
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
  createdAt: string
}

export interface AuthTokens {
  access: string
  // refresh is HttpOnly cookie — JS ko'rmaydi
}

// ─────────────────────────────────────
// Question Bank
// ─────────────────────────────────────

export type QuestionModule = 'math' | 'reading_writing'
export type QuestionStatus = 'draft' | 'review' | 'published' | 'archived'
export type AnswerType = 'mcq' | 'grid_in'

export interface QuestionCategory {
  id: string
  module: QuestionModule
  name: string
  slug: string
  parentId: string | null
  children?: QuestionCategory[]
}

export interface QuestionTag {
  id: string
  name: string
  slug: string
  color: string
}

export interface QuestionChoice {
  id: string
  label: 'A' | 'B' | 'C' | 'D'
  text: string
  imageUrl: string | null
}

export interface Question {
  id: string
  version: number
  module: QuestionModule
  category: QuestionCategory
  difficulty: 1 | 2 | 3 | 4 | 5
  status: QuestionStatus
  stem: string
  stemImageUrl: string | null
  hasMath: boolean
  passage: string | null
  passageImageUrl: string | null
  answerType: AnswerType
  choices: QuestionChoice[]  // empty for grid_in
  explanation: string | null
  explanationImageUrl: string | null
  tags: QuestionTag[]
  createdAt: string
  publishedAt: string | null
}

// Public view — no correct answer
export type QuestionPublic = Omit<Question, 'status' | 'version'>

// ─────────────────────────────────────
// Test Engine / Sessions
// ─────────────────────────────────────

export type ExamType = 'practice' | 'past_paper' | 'mock' | 'midterm' | 'assessment' | 'homework'
export type SessionStatus = 'in_progress' | 'paused' | 'completed' | 'abandoned'

export interface ExamTemplate {
  id: string
  type: ExamType
  title: string
  description: string | null
  module: 'math' | 'reading_writing' | 'full'
  timeLimit: number | null // minutes
  isAdaptive: boolean
  accessLevel: 'public' | 'academy'
  sections: ExamSection[]
}

export interface ExamSection {
  id: string
  title: string
  module: QuestionModule
  sectionNumber: number
  timeLimit: number | null
  questions: QuestionPublic[]
}

// Per-question client state (stored in Zustand + auto-saved)
export interface QuestionClientState {
  answer: string | null
  flagged: boolean
  note: string
  crossedOut: ('A' | 'B' | 'C' | 'D')[]
  highlight: HighlightData | null
}

export interface HighlightData {
  // Serialize qilingan highlight ma'lumoti
  ranges: Array<{ start: number; end: number; color: string }>
}

export interface ExamSession {
  id: string
  examId: string
  status: SessionStatus
  currentSection: number
  currentQuestion: number
  timeRemaining: number | null // seconds
  startedAt: string
  submittedAt: string | null
}

// ─────────────────────────────────────
// Results
// ─────────────────────────────────────

export interface ExamResult {
  id: string
  sessionId: string
  examTitle: string
  examType: ExamType
  totalScore: number | null
  mathScore: number | null
  rwScore: number | null
  totalCorrect: number
  totalIncorrect: number
  totalSkipped: number
  totalQuestions: number
  accuracyPct: number
  timeSpentSecs: number
  percentile: number | null
  scoreBreakdown: {
    categories: Record<string, {
      name: string
      correct: number
      total: number
      accuracy: number
    }>
  }
  computedAt: string
}

// ─────────────────────────────────────
// Analytics
// ─────────────────────────────────────

export interface AnalyticsOverview {
  totalQuestionsAnswered: number
  overallAccuracy: number // percent
  mathAccuracy: number
  rwAccuracy: number
  timeSpentSecs: number
  estimatedScore: number | null
  weakAreas: WeakArea[]
  recommendation: StudyRecommendation
}

export interface WeakArea {
  categoryId: string
  categoryName: string
  module: QuestionModule
  accuracy: number
  totalAnswered: number
}

export interface StudyRecommendation {
  type: 'weak_area' | 'new_topic' | 'practice_test'
  categoryId?: string
  categoryName?: string
  reason: string
  actionLabel: string
  actionUrl: string
}

// ─────────────────────────────────────
// Academy
// ─────────────────────────────────────

export interface Class {
  id: string
  name: string
  code: string
  teacherId: string
  teacherName: string
  isActive: boolean
  startsAt: string | null
  endsAt: string | null
  studentCount: number
}

export interface HomeworkAssignment {
  id: string
  classId: string
  title: string
  instructions: string | null
  dueAt: string
  timeLimit: number | null
  questionCount: number
  mySubmission: HomeworkSubmission | null
}

export interface HomeworkSubmission {
  id: string
  submittedAt: string | null
  score: number | null
  teacherNote: string | null
  gradedAt: string | null
}

// ─────────────────────────────────────
// Notifications
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
