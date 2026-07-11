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

export type UserRole =
  | 'public'
  | 'student'
  | 'teacher'
  | 'receptionist'
  | 'academic_manager'
  | 'admin'

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

/** Admin-facing user (GET /admin/users/) — exposes status + audit fields the
 *  owner-facing `User` hides. */
export interface AdminUser {
  id: string
  email: string
  firstName: string
  lastName: string
  fullName: string
  role: UserRole
  isActive: boolean
  isStaff: boolean
  isEmailVerified: boolean
  avatarUrl: string | null
  satTargetScore: number | null
  examDate: string | null // ISO date
  timezone: string
  lastLoginAt: string | null
  createdAt: string
  updatedAt: string
  deletedAt: string | null
}

/** Org-settings singleton (admin). Presentation-level config only. */
export interface OrgSetting {
  academyName: string
  academicYear: string
  displayTimezone: string
  gradingThresholds: Record<string, number>
  logoUrl: string
  defaultEmailSender: string
  featureFlags: Record<string, boolean>
  updatedAt: string
}

/** One append-only audit row (admin viewer + dashboard activity feed). */
export interface ActivityLog {
  id: string
  actor: string | null
  actorEmail: string | null
  actorName: string | null
  actorRole: string
  action: string
  targetType: string
  targetId: string | null
  targetLabel: string
  summary: string
  metadata: Record<string, unknown>
  ip: string | null
  createdAt: string
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
// CRM person layer (4D)
// ─────────────────────────────────────

export type LifecycleStatus = 'active' | 'frozen' | 'graduated' | 'dropped'
export type Gender = 'male' | 'female' | 'other'
export type GuardianRelation = 'father' | 'mother' | 'guardian' | 'other'

export interface Guardian {
  id: string
  relation: GuardianRelation
  name: string
  phone: string
  telegram: string
  email: string
  isEmergency: boolean
  createdAt: string
}

export interface StudentProfile {
  id: string
  student: StudentMini
  avatarUrl: string | null
  gender: Gender | ''
  dateOfBirth: string | null // yyyy-mm-dd
  phone: string
  address: string
  school: string
  grade: string
  status: LifecycleStatus
  statusChangedAt: string | null
  statusChangedBy: StudentMini | null
  enrolledAt: string | null
  mentor: StudentMini | null
  mentorAssignedAt: string | null
  guardians: Guardian[]
  updatedAt: string
}

// ─────────────────────────────────────
// Academic mentor (S6)
// ─────────────────────────────────────

export type ContactMethod = 'call' | 'message' | 'meeting' | 'other'

/** A mentor's mentee row (GET /teacher/mentees/). */
export interface Mentee {
  id: string
  student: StudentMini
  status: LifecycleStatus
  mentorAssignedAt: string | null
  lastCheckInAt: string | null
}

/** A mentee's drilldown header (GET /students/{id}/mentee/) — mentor-scoped,
 *  carries guardians for the parent-contact form. */
export interface MenteeDetail {
  id: string
  student: StudentMini
  status: LifecycleStatus
  mentorAssignedAt: string | null
  guardians: Guardian[]
}

export interface MentorCheckIn {
  id: string
  mentor: StudentMini | null
  note: string
  createdAt: string
}

export interface ParentContactLog {
  id: string
  guardian: string // Guardian id
  guardianName: string
  author: StudentMini | null
  method: ContactMethod
  note: string
  createdAt: string
}

/** Demographics subset editable by the student (self-serve) or operational staff. */
export interface StudentProfileUpdate {
  gender?: Gender | ''
  dateOfBirth?: string | null
  phone?: string
  address?: string
  school?: string
  grade?: string
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
// Question Bank — admin authoring
// ─────────────────────────────────────

export type QuestionStatus = 'draft' | 'review' | 'published' | 'archived'
export type QuestionSource = 'official' | 'custom' | 'imported'
export type ReviewStatus = 'approved' | 'rejected' | 'needs_revision'

/** Compact author shape (created_by / reviewed_by / reviewer). */
export interface Author {
  id: string
  fullName: string
  email: string
}

/** GET /admin/questions/ — list row (all statuses). */
export interface AdminQuestionListItem {
  id: string
  module: QuestionModule
  category: QuestionCategoryRef
  difficulty: 1 | 2 | 3 | 4 | 5
  answerType: AnswerType
  hasMath: boolean
  status: QuestionStatus
  stem: string
  tags: string[] // slugs
  version: number
  parent: string | null
  createdAt: string
  updatedAt: string
}

/** GET /admin/questions/{id}/ — full admin authoring shape. */
export interface AdminQuestion {
  id: string
  version: number
  parent: string | null
  module: QuestionModule
  category: QuestionCategoryRef
  difficulty: 1 | 2 | 3 | 4 | 5
  status: QuestionStatus
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
  source: QuestionSource
  sourceRef: string | null
  tags: QuestionTag[]
  createdBy: Author
  reviewedBy: Author | null
  publishedAt: string | null
  createdAt: string
  updatedAt: string
}

export interface QuestionReviewEntry {
  id: string
  reviewer: Author
  status: ReviewStatus
  note: string | null
  createdAt: string
}

// ─────────────────────────────────────
// Assessments — admin exam builder + assignments
// ─────────────────────────────────────

/** A question slotted into a section (id = ExamQuestion pk, an integer). */
export interface SectionQuestion {
  id: number
  position: number
  question: {
    id: string
    stem: string
    module: QuestionModule
    difficulty: number
    answerType: AnswerType
    status: QuestionStatus
  }
}

export interface AdminSection {
  id: number
  sectionNumber: number
  title: string
  module: QuestionModule // 'math' | 'reading_writing'
  timeLimit: number | null
  sortOrder: number
  questions: SectionQuestion[]
}

/** GET /admin/exams/{id}/ — full exam with nested sections. */
export interface AdminExam {
  id: string
  type: ExamType
  title: string
  description: string | null
  module: ExamModule
  timeLimit: number | null
  isAdaptive: boolean
  accessLevel: AccessLevel
  sections: AdminSection[]
  createdBy: Author
  createdAt: string
  updatedAt: string
}

export interface AssignmentClassRef {
  id: string
  name: string
}

/** GET /admin/assignments/ — an exam assigned to a class or a student. */
export interface AdminAssignment {
  id: string
  exam: ExamSummary
  assignedBy: Author
  assignedClass: AssignmentClassRef | null
  assignedStudent: Author | null
  opensAt: string
  closesAt: string
  maxAttempts: number
  instructions: string | null
  createdAt: string
}

/** GET /admin/assignments/{id}/sessions/ — a student's progress row. */
export interface AssignmentSessionRow {
  id: string
  student: Author
  status: SessionStatus
  startedAt: string
  submittedAt: string | null
  totalScore: number | null
  accuracyPct: Decimalish
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
// Academy (teacher surface)
// ─────────────────────────────────────

export type EnrollmentStatus = 'active' | 'inactive' | 'removed'

/** GET /teacher/classes/ — a class owned by the requesting teacher. */
export interface TeacherClass {
  id: string
  name: string
  isActive: boolean
  studentCount: number
  createdAt: string
}

/** Roster row (also returned by enroll). createdAt = enrolled-at. */
export interface RosterEntry {
  id: string
  student: StudentMini
  status: EnrollmentStatus
  createdAt: string
}

// ─────────────────────────────────────
// Teacher insights (Phase 4A — dashboard + risk)
// ─────────────────────────────────────

export type RiskLevel = 'green' | 'yellow' | 'red'

export type RiskSignal =
  | 'homework_completion'
  | 'accuracy'
  | 'accuracy_trend'
  | 'activity_recency'

/** One contributing signal behind a risk level (only non-green signals surface). */
export interface RiskReason {
  signal: RiskSignal
  level: RiskLevel
  value: number | null
  unit: 'percent' | 'percent_delta' | 'days'
  message: string // server-rendered fallback; UI localizes from signal/value/unit
}

export interface RiskAssessment {
  level: RiskLevel
  score: number
  reasons: RiskReason[]
}

export interface HomeworkStats {
  assigned: number
  submitted: number // includes graded
  graded: number
  completionPct: number
  overdueIncomplete: number
}

export type TrendDirection = 'up' | 'down' | 'flat' | 'insufficient_data'

export interface ImprovementTrend {
  recentAvgAccuracy: number | null
  priorAvgAccuracy: number | null
  deltaPct: number | null
  trend: TrendDirection
  resultsConsidered: number
}

export interface WeakTopic {
  categoryId: string
  categoryName: string
  module: QuestionModule
  accuracyPct: number
  totalAnswered: number
}

export interface RecentScoreEstimate {
  estimate: number | null
  basedOn: number
  method: string // 'recent_average' — descriptive, not predictive
  latestTotalScore: number | null
  latestMathScore: number | null
  latestRwScore: number | null
}

/** GET /teacher/students/{id}/analytics/ — a teacher's drilldown for one student. */
export interface StudentAnalytics {
  student: StudentMini
  summary: AnalyticsSummary
  progress: CategoryProgress[]
  homeworkStats: HomeworkStats
  riskAssessment: RiskAssessment
  improvementTrend: ImprovementTrend
  weakTopics: WeakTopic[]
  recentScoreEstimate: RecentScoreEstimate
}

// GET /teacher/dashboard/
export interface TeacherDashboardCounts {
  classes: number
  activeStudents: number
  pendingGrading: number
  atRiskStudents: number
}

export interface AtRiskStudent {
  student: StudentMini
  classId: string
  risk: RiskAssessment
}

/** Lean overview — counts + a short at-risk preview. The full, growing lists live
 *  on their own paginated pages (/teacher/students, /teacher/grading). */
export interface TeacherDashboard {
  counts: TeacherDashboardCounts
  atRiskStudents: AtRiskStudent[]
}

/** GET /teacher/grading/ row (cursor-paginated). */
export interface GradingItem {
  submissionId: string
  homeworkId: string
  homeworkTitle: string
  student: StudentMini
  status: HomeworkStatus
  submittedAt: string | null
  classId: string
}

// GET /teacher/classes/{id}/overview/
export interface ClassOverviewRosterEntry {
  student: StudentMini
  risk: RiskAssessment
  overallAccuracy: number | null
  homeworkCompletionPct: number | null
  daysInactive: number | null
}

export interface ClassOverview {
  class: { id: string; name: string; studentCount: number }
  group: {
    avgAccuracy: number | null
    homeworkCompletionRate: number
    atRiskCount: number
  }
  roster: ClassOverviewRosterEntry[]
}

/** GET /teacher/students/ row (cursor-paginated) — same shape as a class-overview
 *  roster entry, across all the teacher's classes. */
export type TeacherStudentRow = ClassOverviewRosterEntry

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
// Support Center (Phase 4 S1 — Book a Teacher)
// ─────────────────────────────────────

export type SupportSubject = 'math' | 'reading_writing'
export type BookingStatus = 'pending' | 'confirmed' | 'completed' | 'cancelled' | 'no_show'

export interface TeacherAvailability {
  id: string
  subject: SupportSubject
  weekday: number // 0=Mon … 6=Sun
  startTime: string // "HH:MM:SS"
  endTime: string
  slotMinutes: number
  isActive: boolean
  createdAt: string
}

export interface BookableTeacher {
  teacher: StudentMini
  subjects: SupportSubject[]
}

export interface SupportSlot {
  scheduledAt: string
  durationMinutes: number
}

/** Student-facing outcome — deliberately OMITS the staff-only `notes` field. */
export interface SessionOutcome {
  topicsCovered: string
  homework: string
  nextRecommendation: string
}

/** Staff-facing outcome — includes `notes`. */
export interface StaffSessionOutcome extends SessionOutcome {
  notes: string
}

export interface SessionRating {
  score: number
  comment: string
  createdAt: string
}

export interface SupportBooking {
  id: string
  student: StudentMini
  teacher: StudentMini
  subject: SupportSubject
  topic: string
  reason: string
  scheduledAt: string
  durationMinutes: number
  actualDurationMinutes: number | null
  status: BookingStatus
  confirmedAt: string | null
  completedAt: string | null
  cancelledAt: string | null
  joinUrl: string
  outcome: SessionOutcome | null
  rating: SessionRating | null
  createdAt: string
}

/** Staff read of a booking — outcome carries the staff-only `notes`. */
export interface StaffSupportBooking extends Omit<SupportBooking, 'outcome'> {
  outcome: StaffSessionOutcome | null
}

// Ask a Question (Phase 4 S2 — tickets)
export type TicketStatus = 'open' | 'answered' | 'closed'
export type TicketPriority = 'low' | 'normal' | 'high'

export interface TicketAttachment {
  id: string
  originalName: string
  contentType: string
  size: number
  downloadUrl: string
}

export interface TicketReply {
  id: string
  author: StudentMini
  body: string
  isStaffAnswer: boolean
  createdAt: string
}

export interface SupportTicketSummary {
  id: string
  student: StudentMini
  subject: SupportSubject
  body: string
  priority: TicketPriority
  status: TicketStatus
  assignedTo: StudentMini | null
  answeredAt: string | null
  lastReplyAt: string | null
  replyCount: number
  createdAt: string
}

export interface SupportTicket extends SupportTicketSummary {
  replies: TicketReply[]
  attachments: TicketAttachment[]
}

// Support analytics (Phase 4 S3). NOTE: the API client camelizes nested keys, so
// the backend's by_status.no_show arrives as byStatus.noShow.
export interface SupportBookingKpis {
  total: number
  byStatus: {
    pending: number
    confirmed: number
    completed: number
    cancelled: number
    noShow: number
  }
  completed: number
  noShowRate: number | null
  avgRating: number | null
  avgWaitMinutes: number | null
  utilization: number | null
}

export interface SupportTicketKpis {
  total: number
  open: number
  answered: number
  closed: number
  avgResponseMinutes: number | null
  answeredByMe: number | null
}

export interface StaffSupportAnalytics {
  scope: 'own' | 'all'
  bookings: SupportBookingKpis
  tickets: SupportTicketKpis
}

export interface StudentSupportSummary {
  sessions: { total: number; completed: number; upcoming: number; avgRatingGiven: number | null }
  tickets: { total: number; open: number; answered: number; closed: number }
}

// Support ops admin dashboard (Phase 4 S7). Client camelizes nested keys.
export interface SupportOpsSummary {
  bookings: {
    total: number
    byStatus: { pending: number; confirmed: number; completed: number; cancelled: number; noShow: number }
    completed: number
    noShowRate: number | null
    avgRating: number | null
    avgWaitMinutes: number | null
  }
  tickets: {
    total: number
    open: number
    answered: number
    closed: number
    avgResponseMinutes: number | null
  }
  officeHours: { upcomingSessions: number; totalAttended: number }
  recommendations: {
    total: number
    byStatus: { new: number; acted: number; dismissed: number; expired: number; superseded: number }
  }
}

export interface SupportOpsDailyPoint {
  date: string // yyyy-mm-dd
  bookingsCreated: number
  bookingsCompleted: number
  bookingsCancelled: number
  bookingsNoShow: number
  ratingsCount: number
  ratingsAvg: number | null
  ticketsCreated: number
  ticketsAnswered: number
  ticketsAvgResponseMinutes: number | null
  officeHoursSessions: number
  officeHoursAttended: number
  recommendationsCreated: number
  recommendationsActed: number
}

export interface SupportOpsOverview {
  summary: SupportOpsSummary
  daily: SupportOpsDailyPoint[]
}

// Proactive Support Session Trigger (Phase 4 S4)
export type RecSeverity = 'info' | 'warning' | 'critical'
export type RecStatus = 'new' | 'acted' | 'dismissed' | 'expired' | 'superseded'
export type RecRuleKey =
  | 'category_accuracy_low'
  | 'score_trend_declining'
  | 'inactive_days'
  | 'homework_completion_low'

export interface SupportRecommendation {
  id: string
  ruleKey: RecRuleKey
  severity: RecSeverity
  status: RecStatus
  subject: SupportSubject | ''
  topic: string
  evidence: Record<string, unknown>
  createdAt: string
  expiresAt: string | null
}

// Office Hours (Phase 4 S5)
export type OfficeHourStatus = 'scheduled' | 'canceled' | 'completed'
export type RSVP = 'joined' | 'left'

export interface OfficeHour {
  id: string
  subject: SupportSubject
  title: string
  description: string
  weekday: number
  startTime: string
  endTime: string
  capacity: number
  openToAll: boolean
  location: string
  joinUrl: string
  isActive: boolean
  createdAt: string
}

export interface OfficeHourSession {
  id: string
  title: string
  subject: SupportSubject
  teacher: StudentMini
  startsAt: string
  endsAt: string
  capacity: number
  location: string
  joinUrl: string
  status: OfficeHourStatus
  joinedCount: number
  seatsLeft: number
  myRsvp: RSVP | null
  createdAt: string
}

export interface OfficeHourAttendee {
  id: string
  student: StudentMini
  rsvp: RSVP
  attended: boolean
  createdAt: string
}

export interface OfficeHourSessionRoster extends OfficeHourSession {
  attendees: OfficeHourAttendee[]
}

// ─────────────────────────────────────
// Notifications
// ─────────────────────────────────────

export type NotificationType =
  | 'exam_graded'
  | 'exam_scheduled'
  | 'homework_assigned'
  | 'homework_due'
  | 'announcement'
  | 'system'
  | 'booking_requested'
  | 'booking_confirmed'
  | 'booking_cancelled'
  | 'booking_completed'
  | 'support_reply'
  | 'office_hours_reminder'
  | 'office_hours_canceled'
  | 'support_recommendation'
  | 'mentor_assigned'
  | 'mentor_checkin_due'

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
