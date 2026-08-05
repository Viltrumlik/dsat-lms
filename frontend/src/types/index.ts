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

/** Attendance (5.2a). */
export type AttendanceStatus = 'present' | 'absent' | 'late' | 'excused'
export interface ClassSession {
  id: string
  klass: string
  klassName: string
  title: string
  startsAt: string
  endsAt: string | null
  location: string
  status: 'scheduled' | 'completed' | 'canceled'
  markedCount: number
  createdAt: string
}
export interface AttendanceRow {
  student: StudentMini
  status: AttendanceStatus | null
  note: string
}
export interface ClassSessionDetail extends ClassSession {
  roster: AttendanceRow[]
}
export interface ClassScheduleRule {
  id: string
  klass: string
  weekday: number
  startTime: string
  endTime: string | null
  title: string
  location: string
  isActive: boolean
  createdAt: string
}

/** Announcements (5.2c). */
export type AnnouncementAudience = 'all_students' | 'all_staff' | 'role' | 'class'
export interface Announcement {
  id: string
  authorName: string | null
  title: string
  body: string
  audienceType: AnnouncementAudience
  audienceRef: string
  channels: string[]
  status: 'draft' | 'sent'
  sentAt: string | null
  deliveryCount: number
  createdAt: string
}
export interface MessageTemplate {
  id: string
  name: string
  subject: string
  body: string
  createdAt: string
}

/** Gradebook (5.3a). */
export interface GradebookItem {
  id: string
  title: string
  dueAt: string
  isExam: boolean
}
export type GradeSource = 'manual' | 'session' | 'none'
export interface GradebookCell {
  submissionId: string | null
  status: string | null
  grade: number | null
  gradeSource: GradeSource
}
export interface GradebookRow {
  student: { id: string; email: string; fullName: string }
  cells: GradebookCell[]
}
export interface Gradebook {
  items: GradebookItem[]
  rows: GradebookRow[]
}

/** Platform analytics (5.3c). */
export interface WeakStudentRow {
  student: { id: string; fullName: string; email: string }
  accuracy: number | null
  homework: number | null
  attendance: number | null
  daysInactive: number | null
  risk: 'red' | 'yellow' | 'green'
}
export interface ActiveTeacherRow {
  teacher: { id: string; fullName: string; email: string }
  classes: number
  students: number
}
export interface ExamDifficultyRow {
  exam: string
  avgAccuracy: number | null
  attempts: number
}
export interface AttendanceClassRow {
  class: string
  rate: number
  marked: number
}
export interface PlatformAnalytics {
  weakStudents: WeakStudentRow[]
  activeTeachers: ActiveTeacherRow[]
  examDifficulty: ExamDifficultyRow[]
  attendanceByClass: AttendanceClassRow[]
}

/** Admin global search (⌘K). */
export interface SearchHit {
  id: string
  title: string
  subtitle: string | null
  url: string
}
export interface SearchGroup {
  type: string
  items: SearchHit[]
}
export interface SearchResults {
  groups: SearchGroup[]
}

/** Admin executive dashboard (5.1). */
export interface DashboardKpis {
  totalStudents: number
  totalTeachers: number
  activeClasses: number
  upcomingExams: number
  completionRate: number | null
  satisfaction: number | null
}
export interface DashboardToday {
  newRegistrations: number
  classesToday: number
  absentToday: number
  homeworkDue: number
  homeworkSubmitted: number
  bookings: number
  upcomingExamsWeek: number
}
export interface DashboardAlert {
  kind: string
  severity: 'red' | 'yellow'
  count: number
  url: string | null
}
export interface DashboardTrendPoint {
  date: string
  newRegistrations: number
  examsTaken: number
  homeworkSubmitted: number
  bookingsCreated: number
  ticketsCreated: number
}
export interface DashboardOverview {
  kpis: DashboardKpis
  today: DashboardToday
  alerts: DashboardAlert[]
  trends: DashboardTrendPoint[]
  recentActivity: ActivityLog[]
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

/** The last answer this student gave to a question, in any sitting.
 *  Null when they have never answered it — or when it sits in a paper they
 *  currently have open, where repeating it would be the answer key. */
export interface MyAttempt {
  chosenAnswer: string
  /** Null while the sitting it came from is still ungraded. */
  isCorrect: boolean | null
  answeredAt: string
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
  myAttempt: MyAttempt | null
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
  myAttempt: MyAttempt | null
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
  createdAt: string
  updatedAt: string
}

/** GET /admin/questions/{id}/ — full admin authoring shape. */
export interface AdminQuestion {
  id: string
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

// ─────────────────────────────────────
// Courses (admin authoring — Phase 5.4)
// ─────────────────────────────────────

export type CourseStatus = 'draft' | 'published' | 'archived'
export type CourseSubject = 'math' | 'reading_writing' | 'general'

/** GET /admin/courses/ — a course row with rolled-up counts. */
export interface AdminCourseListItem {
  id: string
  title: string
  slug: string
  subject: CourseSubject
  status: CourseStatus
  coverImageUrl: string | null
  unitCount: number
  lessonCount: number
  publishedAt: string | null
  createdAt: string
}

/** A lesson node inside the course tree (no full body). */
export interface AdminCourseLessonNode {
  id: string
  title: string
  position: number
  videoUrl: string | null
  linkedExam: string | null
  linkedHomework: string | null
  hasContent: boolean
  attachmentCount: number
}

/** A unit node inside the course tree. */
export interface AdminCourseUnit {
  id: string
  title: string
  position: number
  lessons: AdminCourseLessonNode[]
}

// ─────────────────────────────────────
// Courses (student player — Phase 5.4d)
// ─────────────────────────────────────

export type StudentLessonProgressStatus = 'in_progress' | 'completed'

/** GET /courses/ — an assigned course card for the student, with completion. */
export interface StudentCourseListItem {
  id: string
  title: string
  slug: string
  subject: CourseSubject
  description: string
  coverImageUrl: string | null
  completed: number
  total: number
  completionPct: number
}

/** A lesson inside the student player. */
export interface StudentLesson {
  id: string
  title: string
  position: number
  contentMd: string
  videoUrl: string | null
  linkedExam: LinkedExamMini | null
  linkedHomework: LinkedHomeworkMini | null
  attachments: AdminLessonAttachment[]
  progressStatus: StudentLessonProgressStatus | null
}

export interface StudentCourseUnit {
  id: string
  title: string
  position: number
  lessons: StudentLesson[]
}

/** GET /courses/{id}/ — the full course tree for the player. */
export interface StudentCourse {
  id: string
  title: string
  slug: string
  description: string
  subject: CourseSubject
  coverImageUrl: string | null
  units: StudentCourseUnit[]
}

// ─────────────────────────────────────
// CRM — Student directory (Phase 5.5c)
// ─────────────────────────────────────

export interface AdminStudentRow {
  id: string
  email: string
  fullName: string
  status: string | null
  mentor: { id: string; fullName: string } | null
  tags: { id: string; name: string }[]
}

export interface AdminSavedFilter {
  id: string
  kind: 'students' | 'leads'
  name: string
  params: Record<string, string>
  createdAt: string
}

export interface BulkStudentResult {
  applied: number
  skipped: number
}

// ─────────────────────────────────────
// CRM — Tags / Notes / Timeline (Phase 5.5b)
// ─────────────────────────────────────

export interface CrmTag {
  id: string
  name: string
  color: string
  createdAt: string
}

/** A taggable entity kind (matches backend TAGGABLE). */
export type TaggableEntity = 'student' | 'lead'

export interface StudentNote {
  id: string
  body: string
  pinned: boolean
  author: StaffMini | null
  createdAt: string
  updatedAt: string
}

export type TimelineEventType = 'note' | 'parent_contact' | 'mentor_checkin' | 'audit'

export interface TimelineEvent {
  type: TimelineEventType
  id: string
  timestamp: string
  actor: StaffMini | null
  summary: string
  meta: Record<string, unknown>
}

// ─────────────────────────────────────
// CRM — Leads pipeline (Phase 5.5)
// ─────────────────────────────────────

export type LeadStage = 'new' | 'contacted' | 'trial' | 'registered' | 'lost'
export type LeadSource = 'walk_in' | 'referral' | 'social' | 'web' | 'phone' | 'other' | ''
export type LeadSubject = 'math' | 'reading_writing' | 'full' | 'other' | ''
export type LeadActivityKind = 'note' | 'call' | 'meeting' | 'email' | 'stage_change'

export interface StaffMini {
  id: string
  email: string
  fullName: string
}

/** GET /staff/leads/ — a lead card. */
export interface LeadListItem {
  id: string
  name: string
  email: string
  phone: string
  stage: LeadStage
  source: LeadSource
  subjectInterest: LeadSubject
  owner: StaffMini | null
  convertedUser: string | null
  convertedAt: string | null
  openTasks: number
  createdAt: string
}

export interface LeadActivity {
  id: string
  kind: LeadActivityKind
  body: string
  author: StaffMini | null
  createdAt: string
}

export interface FollowUpTask {
  id: string
  lead: string
  title: string
  dueAt: string
  done: boolean
  doneAt: string | null
  assignee: StaffMini | null
  createdAt: string
}

/** GET /staff/leads/{id}/ — full lead with timeline + tasks. */
export interface LeadDetail {
  id: string
  name: string
  email: string
  phone: string
  stage: LeadStage
  source: LeadSource
  subjectInterest: LeadSubject
  note: string
  owner: StaffMini | null
  convertedUser: StaffMini | null
  convertedAt: string | null
  activities: LeadActivity[]
  followUps: FollowUpTask[]
  createdAt: string
  updatedAt: string
}

/** GET /staff/leads/board/ — leads grouped by stage. */
export interface LeadBoard {
  columns: Record<LeadStage, LeadListItem[]>
}

/** GET /admin/course-assignments/ — a course assigned to a class or student. */
export interface AdminCourseAssignment {
  id: string
  course: { id: string; title: string; status: CourseStatus; subject: CourseSubject }
  assignedBy: { id: string; email: string; fullName: string }
  assignedClass: { id: string; name: string } | null
  assignedStudent: { id: string; email: string; fullName: string } | null
  opensAt: string | null
  closesAt: string | null
  note: string
  createdAt: string
}

/** GET /admin/course-assignments/{id}/progress/ — a student's completion row. */
export interface CourseProgressRow {
  student: { id: string; fullName: string; email: string }
  completed: number
  total: number
  pct: number
}

/** A file linked to a lesson. */
export interface AdminLessonAttachment {
  id: string
  attachmentId: string
  originalName: string
  contentType: string
  size: number
  caption: string
  downloadUrl: string
  createdAt: string
}

export interface LinkedExamMini {
  id: string
  title: string
  type: ExamType
}

export interface LinkedHomeworkMini {
  id: string
  title: string
}

/** GET /admin/lessons/{id}/ — full lesson for the editor. */
export interface AdminLessonDetail {
  id: string
  unit: string
  course: string
  title: string
  position: number
  contentMd: string
  videoUrl: string | null
  linkedExam: string | null
  linkedExamDetail: LinkedExamMini | null
  linkedHomework: string | null
  linkedHomeworkDetail: LinkedHomeworkMini | null
  attachments: AdminLessonAttachment[]
  createdAt: string
  updatedAt: string
}

/** GET /admin/courses/{id}/ — full course with nested units + lessons. */
export interface AdminCourse {
  id: string
  title: string
  slug: string
  description: string
  subject: CourseSubject
  status: CourseStatus
  coverImageUrl: string | null
  publishedAt: string | null
  units: AdminCourseUnit[]
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
  /** Whether the clock may be stopped. Off for invigilated papers — pausing a
   *  timed test is unlimited time, so the server refuses it there. */
  allowPause: boolean
  /** Built by the question bank rather than authored. A drill is scored as a
   *  drill: accuracy and a per-skill breakdown, not a scaled SAT total. */
  isGenerated: boolean
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

/** A saved answer. `isCorrect` is absent entirely while the paper is open —
 *  the server withholds correctness until submit so the answer endpoint can't
 *  be used as an oracle — and present once the session is completed. */
export interface SessionResponse {
  question: string
  chosenAnswer: string
  isCorrect?: boolean | null
  /** Only on an instant-feedback session's answer reply. */
  correctAnswer?: string
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
  feedbackMode: FeedbackMode
  timeRemaining: number | null // seconds — server-computed cache
  serverTimeRemaining: number | null // seconds — authoritative (tighter of the two below)
  sectionTimeRemaining: number | null // seconds left in this module
  examTimeRemaining: number | null // seconds left on the whole paper
  startedAt: string
  submittedAt: string | null
  clientSessionData: ClientSessionData
  sections: SessionSectionRaw[]
  responses: SessionResponse[]
}

/** How a student's answer compared with the key (distinct from the question
 *  content-review `ReviewStatus`). */
export type AnswerReviewStatus = 'correct' | 'incorrect' | 'skipped'

/** How a session marks answers. `instant` is a question-bank drill: each answer
 *  is marked as it is given and the key comes back with it. `none` is a paper —
 *  the client is told nothing until submit. Set by the server at start. */
export type FeedbackMode = 'none' | 'instant'

/**
 * GET /sessions/{id}/review/ — one row of the post-submission answer review.
 * Unlike the in-test shapes this DOES carry the correct answer + explanation,
 * and the question content is read live from the question bank.
 */
export interface SessionReviewItem {
  number: number
  sectionNumber: number
  sectionTitle: string
  question: SessionQuestion
  correctAnswer: string
  chosenAnswer: string | null
  status: AnswerReviewStatus
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
  /** Legacy free-text note. Superseded by `annotations`; kept so older
   *  client_session_data blobs still round-trip. */
  note: string
  crossedOut: ChoiceLabel[]
  highlight: HighlightData | null
  /** Bluebook "Highlights & Notes" — a highlight optionally carrying a note. */
  annotations: Annotation[]
}

export type HighlightColor = 'yellow' | 'blue' | 'pink'

/** Which text block an annotation is anchored to. */
export type AnnotationTarget = 'stimulus' | 'stem'

/**
 * A user highlight over the rendered plain text of a target block.
 * `start`/`end` are character offsets into that block's textContent, so an
 * annotation survives a reload as long as the question content is unchanged.
 */
export interface Annotation {
  id: string
  target: AnnotationTarget
  start: number
  end: number
  text: string
  color: HighlightColor
  underline: boolean
  note: string
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

export type HomeworkStatus = 'assigned' | 'submitted' | 'returned' | 'graded'

/** A file attached to a brief or handed in with a submission. */
export interface HomeworkFile {
  id: string
  originalName: string
  contentType: string
  size: number
  attemptNumber?: number
}

export type HomeworkEventKind = 'submitted' | 'returned' | 'graded'

/** One entry in a submission's trail. */
export interface HomeworkEvent {
  id: string
  kind: HomeworkEventKind
  actorName: string | null
  note: string
  attemptNumber: number
  createdAt: string
}

/** The requesting student's own submission, embedded in homework payloads. */
export interface HomeworkMySubmission {
  id: string
  status: HomeworkStatus
  submittedAt: string | null
  responseText: string
  isLate: boolean
  attemptNumber: number
  returnedAt: string | null
  grade: string | null
  gradeScale: number
  feedback: string
  gradedAt: string | null
  files: HomeworkFile[]
  events: HomeworkEvent[]
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
  /** Materials the teacher attached to the brief. */
  attachments: HomeworkFile[]
  mySubmission: HomeworkMySubmission | null // null for teachers and for students with no submission yet
  createdAt: string
}

/** Submission row (teacher submissions view; also returned by submit). */
export interface HomeworkSubmission {
  id: string
  student: StudentMini
  status: HomeworkStatus
  submittedAt: string | null
  responseText: string
  isLate: boolean
  attemptNumber: number
  returnedAt: string | null
  grade: string | null
  gradeScale: number
  feedback: string
  gradedAt: string | null
  files: HomeworkFile[]
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
  | 'homework_graded'
  | 'homework_returned'
  | 'class_post'
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
  | 'course_assigned'
  | 'lead_assigned'
  | 'follow_up_due'

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

// ─────────────────────────────────────
// Permissions matrix (Phase 5.6a)
// ─────────────────────────────────────

/** One (role, capability) cell of the effective matrix. `capability` is a stable
 *  snake_case value (not camelized — the backend returns cells as a list). */
export interface PermissionCell {
  capability: string
  allowed: boolean
  default: boolean
  overridden: boolean
}

export interface PermissionRow {
  role: string
  cells: PermissionCell[]
}

export interface PermissionMatrix {
  capabilities: string[]
  roles: string[]
  editableRoles: string[]
  matrix: PermissionRow[]
}

export interface PermissionOverride {
  role: string
  capability: string
  allowed: boolean
}

// ─────────────────────────────────────
// Automation engine (Phase 5.6b/c)
// ─────────────────────────────────────

/** The condition DSL tree (mirrors the backend). All keys are lowercase, so the
 *  camel↔snake client transform leaves them untouched. */
export type ConditionNode =
  | { type: 'group'; op: 'and' | 'or'; children: ConditionNode[] }
  | { type: 'condition'; field: string; op: string; value: unknown }

export interface RuleAction {
  type: string
  params: Record<string, unknown>
}

export type AutomationTrigger = 'scheduled_daily' | 'event'

export interface AutomationRule {
  id: string
  name: string
  description: string
  enabled: boolean
  triggerType: AutomationTrigger
  eventKey: string
  subjectType: string
  conditions: ConditionNode
  actions: RuleAction[]
  createdBy: StaffMini | null
  lastRunAt: string | null
  logCount: number
  createdAt: string
  updatedAt: string
}

/** POST/PATCH body — keys the write serializer accepts. */
export interface AutomationRuleInput {
  name: string
  description?: string
  enabled?: boolean
  trigger_type: AutomationTrigger
  event_key?: string
  conditions: ConditionNode
  actions: RuleAction[]
}

export interface AutomationLog {
  id: string
  ruleId: string
  ruleName: string
  subjectType: string
  subjectId: string
  subjectLabel: string
  runDate: string
  matched: boolean
  actionsTaken: Array<{ type?: string; status: string; detail?: string }>
  status: 'ok' | 'skipped' | 'error'
  error: string
  createdAt: string
}

// Catalog (drives the builder). List-shaped so snake_case values survive.
export interface CatalogField {
  key: string
  label: string
  type: 'number' | 'enum'
  ops: string[]
  choices: string[]
}
export interface CatalogAction {
  type: string
  label: string
  params: Array<{ key: string; kind: string; required: boolean; choices: string[] }>
}
export interface AutomationCatalog {
  subjectTypes: string[]
  triggers: Array<{ key: string; label: string }>
  events: Array<{ key: string; label: string; subjectType: string }>
  fields: CatalogField[]
  operators: Array<{ op: string; label: string }>
  actions: CatalogAction[]
  limits: { maxDepth: number; maxChildren: number; maxActions: number }
}

export interface AutomationDryRun {
  cohortSize: number
  matchedCount: number
  sample: Array<{ id: string; label: string }>
  actions: RuleAction[]
}

export interface AutomationSweepResult {
  rules: number
  students: number
  matched: number
  acted: number
}

// ─────────────────────────────────────
// Classroom stream
// ─────────────────────────────────────

/** A class the current user is in (GET /classes/). */
export interface MyClass {
  id: string
  name: string
  teacherName: string | null
  isActive: boolean
}

export interface StreamAuthor {
  id: string
  fullName: string
  role: UserRole
}

export interface StreamAttachment {
  id: string
  originalName: string
  contentType: string
  size: number
}

export interface ClassComment {
  id: string
  author: StreamAuthor
  body: string
  createdAt: string
}

export type ClassPostKind = 'post' | 'announcement' | 'material'

export interface ClassPost {
  id: string
  kind: ClassPostKind
  author: StreamAuthor
  body: string
  isPinned: boolean
  allowComments: boolean
  attachments: StreamAttachment[]
  comments: ClassComment[]
  createdAt: string
}
