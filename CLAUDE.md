# DSAT LMS v2 — Claude Code Session Guide

> Bu fayl har bir Claude Code sessiyasi boshida avtomatik o'qiladi.
> Har doim bu yerdan boshlang. Hech narsani taxmin qilmang — faqat shu hujjatga asoslaning.

---

## 1. LOYIHA HAQIDA

**Nima qurilmoqda:** Digital SAT Learning Management System — versiya 2.
**Kim uchun:** Bitta akademiyaning SAT talabalari + umumiy foydalanuvchilar.
**Eski tizim:** Mastersat (questions.mastersat.uz) — bu uning kloni EMAS. Yangi arxitektura, yangi kod bazasi.

### Asosiy farq — Public vs Academy
```
Public user → SQB, Practice Tests (limited), Past Papers (limited), Basic Analytics
Academy student → Hamma narsa: Mock Exams, Homework, Classes, Rankings, Teacher feedback
```

---

## 2. TECH STACK

### Frontend
```
Framework:    Next.js 14 (App Router)
Language:     TypeScript (strict mode)
Styling:      Tailwind CSS + shadcn/ui + Radix UI
Icons:        Lucide React
State:        TanStack Query + React Context (Zustand faqat test engine uchun)
Forms:        React Hook Form + Zod
Tables:       TanStack Table
Charts:       Recharts (dynamic import — lazy load)
Math:         KaTeX (MathJax emas — tezroq)
HTTP:         Axios (typed interceptors bilan)
```

### Backend
```
Framework:    Django 5.x + Django REST Framework
Language:     Python 3.12+
Auth:         JWT (djangorestframework-simplejwt) + HttpOnly cookie refresh tokens
Database:     PostgreSQL 16
Cache:        Redis 7
Background:   Celery + Celery Beat
Storage:      Cloudflare R2 (dev: local)
Search:       PostgreSQL FTS (100k+ savolda: OpenSearch)
Email:        Resend (yoki Amazon SES)
```

### Infrastructure
```
Dev:          Docker Compose
Prod:         Docker + Nginx + Ubuntu Server
CI/CD:        GitHub Actions
Monitoring:   Sentry + Uptime Kuma
```

---

## 3. LOYIHA STRUKTURASI

```
dsat-lms/
├── CLAUDE.md              ← BU FAYL
├── docker-compose.yml
├── .env.example
├── frontend/              ← Next.js app
│   ├── src/
│   │   ├── app/
│   │   │   ├── (public)/      # Public layout
│   │   │   ├── (student)/     # Academy student layout
│   │   │   ├── (session)/     # Test engine — NO sidebar/navbar
│   │   │   ├── (teacher)/     # Teacher layout
│   │   │   └── (admin)/       # Admin layout
│   │   ├── components/
│   │   │   ├── ui/            # shadcn/ui base
│   │   │   ├── common/        # Navbar, Sidebar
│   │   │   ├── question-bank/
│   │   │   ├── test-engine/   # THE CORE — alohida
│   │   │   ├── analytics/
│   │   │   └── admin/
│   │   ├── lib/
│   │   │   ├── api/           # Typed API client
│   │   │   ├── hooks/         # useSession, useAutoSave, useTimer
│   │   │   ├── stores/        # Zustand (faqat sessionStore)
│   │   │   └── utils/
│   │   └── types/             # TypeScript types
│   ├── package.json
│   └── tsconfig.json
│
└── backend/               ← Django app
    ├── config/
    │   ├── settings/
    │   │   ├── base.py
    │   │   ├── development.py
    │   │   └── production.py
    │   └── urls.py
    ├── apps/
    │   ├── identity/          # Auth, users, permissions
    │   ├── academy/           # Classes, enrollment, attendance
    │   ├── question_bank/     # Questions, categories, tags
    │   ├── assessments/       # Exam templates, sessions, results
    │   ├── homework/          # Homework
    │   ├── analytics/         # Stats, rankings, progress
    │   └── notifications/     # In-app notifications
    ├── common/                # BaseModel, permissions, exceptions
    ├── requirements/
    │   ├── base.txt
    │   ├── development.txt
    │   └── production.txt
    └── manage.py
```

---

## 4. QOIDALAR — HAR DOIM RIOYA QILING

### 4.1 Umumiy qoidalar

```
✅ TypeScript strict mode — any ishlatmang
✅ Barcha API javoblar typed bo'lishi kerak
✅ Har bir Django app o'z serializer, view, url fayllariga ega
✅ BaseModel ishlating (created_at, updated_at, deleted_at, UUID pk)
✅ Soft delete — hech qachon .delete() yo'q, faqat .soft_delete()
✅ Hamma listlar paginated (cursor-based, offset emas)
✅ Error responses har doim standart formatda (quyida ko'rsatilgan)
✅ Permission check server-side, har bir endpoint'da
✅ N+1 oldini olish — select_related() va prefetch_related() ishlating
```

### 4.2 Qilmaslik kerak

```
❌ Raw SQL yozmang — ORM ishlating
❌ User input'ni sanitize qilmasdan ishlатмang
❌ Secrets'ni kодга qo'ymang — .env ishlating
❌ GraphQL qo'shmang — REST yetarli
❌ Redux ishlатмang — TanStack Query + Context yetarli
❌ MathJax ishlатмang — KaTeX ishlating
❌ offset-based pagination — cursor-based ishlating
❌ Hard delete — soft delete ishlating
❌ God objects — har bir app o'z mas'uliyatiga ega
❌ Circular imports — domain dependency tartibini saqlang
```

### 4.3 Naming conventions

```python
# Python/Django
snake_case     → variable_name, function_name, file_name.py
PascalCase     → ClassName, SerializerName
SCREAMING_SNAKE → CONSTANT_NAME, PERMISSION_CONSTANT
```

```typescript
// TypeScript/React
camelCase      → variableName, functionName
PascalCase     → ComponentName, TypeName
kebab-case     → file-name.tsx, component-name.tsx
SCREAMING_SNAKE → CONSTANT_NAME
```

---

## 5. DATABASE — ASOSIY JADVALLAR

### Domain tartib (dependency order)
```
identity → question_bank → assessments → analytics
                                ↓
                            academy (hammaga bog'liq)
```

### Eng muhim jadvallar
```sql
users               -- role: public | student | teacher | admin
classes             -- akademiya sinflari
class_enrollments   -- student ↔ class
qb_categories       -- module(math/rw) + parent_id (tree)
questions           -- versioning (parent_id), status (draft/review/published/archived)
question_choices    -- A/B/C/D per question
exam_templates      -- practice | past_paper | mock | midterm | assessment | homework
exam_sessions       -- user sessiyasi (status: in_progress/paused/completed)
exam_responses      -- har bir savolga javob
exam_results        -- hisoblangan natijalar
user_category_stats -- analytics (denormalize, Celery bilan yangilanadi)
```

### JSONB faqat shu yerda
```sql
exam_sessions.client_session_data  -- flagged questions, highlights, notes, crossed_out
exam_results.score_breakdown       -- per-category breakdown
notifications.data                 -- action URL, related IDs
```

---

## 6. API STANDARTLARI

### URL format
```
/api/v1/<resource>/           GET (list), POST (create)
/api/v1/<resource>/<id>/      GET (detail), PUT/PATCH, DELETE
/api/v1/<resource>/<id>/<action>/  POST (submit, approve, pause...)

Admin endpoints:
/api/v1/admin/<resource>/
```

### Response format — HAR DOIM SHUNDAY

```json
// Success
{
  "success": true,
  "data": {},
  "meta": { "pagination": { "count": 0, "next": null, "previous": null } }
}

// Error
{
  "success": false,
  "error": {
    "code": "SNAKE_CASE_ERROR_CODE",
    "message": "Human readable message.",
    "field": null
  }
}

// Validation Error
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Please fix the errors below.",
    "fields": { "email": ["This email is already registered."] }
  }
}
```

### Auth headers
```
Authorization: Bearer <access_token>    ← API calls uchun
Cookie: refresh_token=<token>           ← HttpOnly, refresh uchun
```

---

## 7. TEST ENGINE — ALOHIDA E'TIBOR

Test engine eng murakkab qism. Shu qoidalar buzilmasligi kerak:

```typescript
// Session state Zustand'da — sessionStore.ts
interface SessionState {
  sessionId: string
  status: 'loading' | 'active' | 'review' | 'submitted'
  currentSection: number
  currentQuestion: number
  timeRemaining: number          // seconds
  questionStates: Record<string, QuestionState>
  questions: Question[]
}

// Auto-save — 30 soniyada bir
PATCH /api/v1/sessions/:id
{
  current_section: number,
  current_question: number,
  time_remaining: number,
  client_session_data: { questions: { [id]: { flagged, note, crossed_out, highlight } } }
}

// Timer — server-side authoritative
// Client faqat display uchun countdown qiladi
// Server: started_at + time_limit = absolute deadline
// Cheat detection: client bergan time_remaining > real elapsed → reject
```

### Session Recovery
```
1. Crash → localStorage backup (Zustand persist)
2. Refresh → localStorage restore + server GET /sessions/:id sync
3. Server state wins always
```

---

## 8. PERMISSION SYSTEM

```python
# Django permission classes (common/permissions.py)
IsAdmin          # role == 'admin'
IsTeacher        # role == 'teacher'
IsAcademyStudent # role == 'student'
IsPublicUser     # role == 'public'
IsOwner          # object.user_id == request.user.id

# Composite
IsAdminOrTeacher     # admin OR teacher
IsAdminOrOwner       # admin OR object owner

# Object-level
CanAccessExam        # exam.access_level == 'public' OR user is academy student
CanViewStudentData   # teacher sees only own class students
```

---

## 9. CONTENT LIFECYCLE (Question Bank)

```
DRAFT → submit_for_review → REVIEW → approve → PUBLISHED
                                    → reject  → DRAFT (with note)

PUBLISHED → update needed → new VERSION created (parent_id = old id)
                           → old → ARCHIVED
                           → new → PUBLISHED
```

---

## 10. CELERY TASKS

```python
# analytics/tasks.py
update_category_stats(user_id)      # exam tugaganda — user_category_stats yangilash
calculate_percentile(result_id)     # global percentile hisoblash

# notifications/tasks.py  
send_homework_due_reminders()       # beat: har kuni ertalab
send_exam_scheduled_notification()  # exam yaratilganda

# email/tasks.py
send_verification_email(user_id)
send_password_reset_email(user_id)

# imports/tasks.py
bulk_import_questions(file_path, user_id)  # CSV/JSON import
```

---

## 11. MUHIM FAYL IZOHLAR

Har bir yangi fayl yozilganda yuqoriga shunday comment qo'ying:

```python
# apps/question_bank/serializers.py
# Domain: Question Bank
# Description: Serializers for public question browsing and admin content studio
# Permissions: varies per serializer (see docstrings)
```

```typescript
// src/components/test-engine/TestShell.tsx
// Domain: Test Engine
// Description: Root wrapper for all test sessions (practice, mock, homework)
// State: reads from sessionStore (Zustand)
// No sidebar/navbar — fullscreen experience
```

---

## 12. QANDAY BOSHLASH

### Yangi feature boshlaganda:
```
1. Avval shu CLAUDE.md'ni o'qing (avtomatik bo'ladi)
2. Qaysi domain? → tegishli app/folder'ga boring
3. Database migration kerakmi? → apps/<domain>/migrations/
4. API endpoint? → apps/<domain>/views.py + urls.py
5. Frontend? → src/app/(layout)/page.tsx + tegishli komponent
6. Test yozing (pytest / Vitest)
7. Commit: "<domain>: <what changed>"
```

### Commit message format:
```
feat(question_bank): add bulk import endpoint
fix(test_engine): timer sync issue on mobile
refactor(analytics): denormalize category stats table
docs(api): update session auto-save spec
```

---

## 13. ENVIRONMENT VARIABLES

`.env.example` dan nusxa oling, `.env` yarating:

```bash
# Django
DJANGO_SECRET_KEY=
DJANGO_DEBUG=True
DJANGO_ALLOWED_HOSTS=localhost,127.0.0.1

# Database
DATABASE_URL=postgresql://dsat:dsat@localhost:5432/dsat_db

# Redis
REDIS_URL=redis://localhost:6379/0

# JWT
JWT_ACCESS_TOKEN_LIFETIME_MINUTES=15
JWT_REFRESH_TOKEN_LIFETIME_DAYS=30

# Auth throttling (DRF ScopedRateThrottle; per-IP, format "<count>/<s|min|hour|day>")
THROTTLE_AUTH_LOGIN=30/min
THROTTLE_AUTH_REGISTER=30/min
THROTTLE_AUTH_PASSWORD_RESET=10/min
THROTTLE_AUTH_VERIFY_EMAIL=10/min
THROTTLE_ADMIN_SET_PASSWORD=10/min
NUM_PROXIES=0   # 0 = no proxy (dev); behind Nginx set to the trusted hop count (1)

# Storage (dev: local, prod: R2)
STORAGE_BACKEND=local   # or r2
R2_ACCOUNT_ID=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET_NAME=

# Email
EMAIL_BACKEND=resend    # or ses
RESEND_API_KEY=

# Sentry (optional in dev)
SENTRY_DSN=

# Frontend
NEXT_PUBLIC_API_URL=http://localhost:8000
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

---

## 14. DEV MUHITINI ISHGA TUSHIRISH

```bash
# 1. Docker Compose (barcha servislar)
docker compose up -d

# 2. Backend (alohida terminal)
cd backend
python manage.py migrate
python manage.py createsuperuser
python manage.py runserver

# 3. Celery worker (alohida terminal)
cd backend
celery -A config worker -l info

# 4. Frontend (alohida terminal)
cd frontend
npm install
npm run dev

# Portlar:
# Frontend:  http://localhost:3000
# Backend:   http://localhost:8000
# Admin:     http://localhost:8000/admin
# API docs:  http://localhost:8000/api/v1/schema/
```

---

## 15. ARXITEKTURA CHEKLOVLARI

Bularni hech qachon buzmang:

```
1. Teacher faqat o'z sinfini ko'radi — HECH QACHON boshqa sinf ma'lumotini qaytarmang
2. Public user academy-only kontentga kirmasligi kerak — server-side enforce qiling
3. Exam session timer server-side authoritative — client timer faqat display
4. Question versioning — hech qachon published savolni in-place edit qilmang, yangi version yarating
5. Soft delete — hech qachon hard delete, faqat deleted_at = now()
6. Circular imports yo'q — domain dependency tartibiga rioya qiling
7. JSONB faqat belgilangan 3 joyda — boshqa hamma narsa typed column
```

---

## PHASE 1 — FRONTEND CORE SLICE (✅ COMPLETE)

> **Goal:** ship a usable student flow end-to-end against the live backend —
> **auth → student dashboard → take a practice test (test engine) → see results.**
> Teacher/admin, analytics charts, question-bank browsing, academy/homework UIs = Phase 2+.

### Current state — do NOT rebuild
**Backend = DONE** (on GitHub, CI green). All endpoints live; responses use the
`{ success, data, meta }` envelope with **snake_case** fields.
**Frontend plumbing = DONE — reuse, don't rewrite:**
- `src/lib/api/client.ts` — axios + Bearer + refresh-token queue; `get/post/patch/put/del<T>` unwrap `response.data.data`.
- `src/lib/stores/sessionStore.ts` — Zustand (persist key `dsat-session`); 19 actions + selectors (`selectAutoSavePayload`, `selectCurrentQuestion`…).
- `src/lib/hooks/useAutoSave.ts` (30s + `beforeunload`), `src/lib/hooks/useTimer.ts` (display-only countdown).
- `src/types/index.ts` (domain types), `tailwind.config.ts` (design tokens, dark mode).

**Frontend UI = EMPTY** — build it.

### ⚠️ FIRST TASK — reconcile the API layer with the real backend
The existing `lib/api` was written against an assumed API and drifted. Fix before building UI:
1. **Casing:** add a transform in `client.ts` (snake→camel on responses, camel→snake on request bodies) — recommended — or switch types to snake_case. One approach, applied consistently.
2. **client.ts refresh bug:** it reads `response.data.data.access` but the backend returns `{ access_token }`. Login/register also return `{ user, access_token }`. Fix the field names.
3. **sessions.ts:** start body = `{ exam: "<uuid>" }`; autosave fields = `current_section/current_question/time_remaining/client_session_data`; result path = `/sessions/{id}/result/` (singular); submit returns the `ExamResult`. **Add** `answer(id, { question, chosen_answer })` → POST `/{id}/answer/`, `resume(id)` → POST `/{id}/resume/`, `list()` → GET `/`. `start`/`get` return the full session-detail object (nested `exam` + `sections` + `server_time_remaining`), not `{ session, exam }`.
4. Add `lib/api/auth.ts` (needed now); `questions.ts`/`analytics.ts`/`notifications.ts` as you reach them.

### Backend API surface (live, under `/api/v1/`)
- **auth/**: POST `register` `login` `refresh` `logout`; GET `me`; POST `verify-email/confirm` `verify-email/resend` `password/reset` `password/reset/confirm` `password/change`. Access token in body (`access_token`); refresh = HttpOnly cookie scoped to `/api/v1/auth/`.
- **questions/**: GET `` (filters: module, difficulty, difficulty_min/max, category, tag, has_math, source; `search`; cursor pagination), `<id>/`, `categories/`, `tags/`.
- **sessions/**: POST `` (start), GET `<id>/`, PATCH `<id>/` (autosave), POST `<id>/answer/` `<id>/pause/` `<id>/resume/` `<id>/submit/`, GET `<id>/result/`, GET `` (history).
- **analytics/**: GET `progress/` `summary/` `rankings/`.  **notifications/**: GET `` (`?unread=1`) `unread-count/`; POST `<id>/read/` `read-all/`.

### Deliverables (core slice)
1. **Foundation:** `app/layout.tsx`, `globals.css` (import KaTeX CSS), providers (TanStack Query, theme). Init **shadcn/ui** (Button, Input, Card, Dialog, Label, Toast, Badge, Progress) in `components/ui/`.
2. **Auth `(public)`:** login, register, verify-email, forgot/reset pages (React Hook Form + Zod). `AuthProvider` (Context) holding user + access token (`setAccessToken`), restoring via `GET /auth/me` on load. `middleware.ts` (or layout guard) protecting `(student)`/`(session)`.
3. **Student shell + dashboard `(student)`:** `layout.tsx` (Navbar + Sidebar in `components/common/`); dashboard = summary (`GET /analytics/summary/`) + available practice tests + recent sessions (`GET /sessions/`).
4. **Test engine UI `(session)` — the core, hardest part:** fullscreen, no nav. Wire `sessionStore` + `useTimer` + `useAutoSave` to: a **question renderer** (markdown + KaTeX via `react-markdown` + `remark-math` + `rehype-katex`), MCQ choices + grid-in, flag/cross-out/note, **timer** (warning/danger), section + question navigator, pause/resume, submit (confirm dialog). **Session recovery:** hydrate localStorage → `GET /sessions/{id}/` to sync (server wins).
5. **Results screen:** score card (total/math/rw), accuracy, per-category breakdown (`GET /sessions/{id}/result/`).

### Conventions (see also §2 tech stack, §7 test engine)
TanStack Query for server state; **Zustand only** for the session engine. shadcn/ui + Radix (installed), **KaTeX** (not MathJax), React Hook Form + Zod, Recharts lazy (Phase 2). TypeScript strict, no `any`, `@/*` → `src/*`. Timer is **server-authoritative** (client display only). Route groups: `(public)` `(student)` `(session)`; `(teacher)`/`(admin)` = Phase 2.

### Verification (end-to-end)
1. Backend: `cd backend && source .venv/bin/activate && python manage.py runserver` (dev = Celery eager + SQLite, no Redis/Postgres). Seed a public `ExamTemplate` (type=practice) with a section + a few published questions via `/admin/`.
2. Frontend: `cd frontend && npm install && npm run dev` → http://localhost:3000.
3. Flow: register → verify (dev prints the link to the backend console) → dashboard → start practice test → answer (KaTeX renders) → timer counts down → flag/cross-out work → auto-save PATCH every 30s → **refresh mid-test and confirm recovery** → submit → results screen.
4. `npm run type-check` + `npm run lint` clean. Add vitest tests for the API reconciliation + a couple store/hook tests; Playwright e2e for the happy path (stretch).

### Out of scope (Phase 2+)
Teacher & admin surfaces, analytics charts, public/marketing pages, question-bank browsing UI, academy/homework UI, notifications UI, i18n, official SAT scaling tables, deployment.

---

## PHASE 2 — ACADEMY & CONTENT SURFACES

> **Goal:** grow past the public student core into the academy + content surfaces —
> homework, notifications, and teacher class management — layering role-based routing
> on top of the working Phase 1 shell. Admin authoring (content studio / exam builder /
> user management) is **Phase 3** — it needs new backend REST endpoints first.

### Already shipped (Phase 2, branch `feat/phase2-question-bank`)
- ✅ **Question Bank** — `(student)/questions` + `/questions/[id]` (filters + infinite scroll; study view: MCQ reveal + grid-in). `lib/api/questions.ts`.
- ✅ **Analytics** — `(student)/analytics` (summary, lazy Recharts accuracy chart, category mastery, academy leaderboard). `components/analytics/*`.
- ✅ **i18n** — EN/UZ in-app toggle (cookie-persisted, flash-free SSR). `lib/i18n/*` (`useT`, `en.ts`/`uz.ts`). Whole app localized.
- ✅ **2D Homework (student)** — `(student)/homework` + `[id]`; status badges incl. overdue; exam-backed Start → test engine; submit w/ confirm dialog. Backend adds `my_submission` to homework payloads + `seed_demo_academy` command. `lib/api/homework.ts`, `components/homework/*`.
- ✅ **2E Notifications** — navbar bell (30s-polled unread badge, recent dropdown) + `(student)/notifications` (cursor list, mark-read/all). Deep links via `notification.data` (`components/notifications/link.ts`). Backend notifies enrolled students on homework create (`homework_assigned`). `ui/dropdown-menu.tsx`.
- ✅ **2F Teacher surface** — `(teacher)` group under `/teacher`: classes (list/create), roster + enroll-by-email, homework assign dialog (class/exam selects) + per-student submissions. `RequireRole`, `TeacherSidebar`, role-gated "Teacher panel" entry in the student sidebar. `lib/api/teacher.ts`; `ui/{select,textarea,table}.tsx`.

### Reuse — do NOT rebuild
API client (`lib/api/client.ts`: `get/post/patch/del/getPaginated` + snake↔camel transform, `cursorFromUrl`); TanStack Query (`useQuery`/`useInfiniteQuery`/`useMutation`); `parseApiError` + toasts; i18n (`useT`; **add every new key to BOTH `en.ts` and `uz.ts`** — `uz` is typed `as Dictionary`, so a missing key fails the build); shadcn/ui primitives; `RequireAuth`.

### Backend readiness (verified against the live API)
**READY — build now (REST endpoints exist):**
- **Homework** — `GET/POST /homework/`, `GET /homework/{id}/`, `POST /homework/{id}/submit/` (student), `GET /homework/{id}/submissions/` (teacher). Class-scoped visibility.
- **Notifications** — `GET /notifications/` (`?unread=1`), `GET /notifications/unread-count/`, `POST /notifications/read-all/`, `POST /notifications/{id}/read/` (IsAuthenticated, owner-scoped, cursor-paginated).
- **Teacher classes** — `GET/POST /teacher/classes/`, `GET /teacher/classes/{id}/roster/`, `POST /teacher/classes/{id}/enroll/` (IsAdminOrTeacher; teacher sees only own classes).

**NOT READY → Phase 3** (models + lifecycle methods + Django admin exist, but no REST endpoints):
- Admin **content studio** — question authoring/review; `submit_for_review`/`approve`/`reject` live on `apps/question_bank/models.py` but are unexposed.
- Admin **exam authoring + assignments** — `ExamTemplate`/`ExamSection`/`ExamQuestion`/`ExamAssignment` in `apps/assessments`.
- Admin **user management** — `apps/identity/urls_admin.py` is an empty stub.
- **Teacher per-student analytics** — `CanViewStudentData` exists (`common/permissions.py`); no endpoint yet.

### Shared prerequisites (build as needed; mostly before the Teacher slice)
1. **UI primitives** — add to `components/ui/`: `select.tsx`, `textarea.tsx`, `table.tsx` (Radix + CVA, match existing style). Needed by homework/teacher forms + tables.
2. **Role-gating** — add `RequireRole` (or extend `components/common/RequireAuth.tsx`) to gate by `user.role`; add a `(teacher)` route group + layout (own Navbar/Sidebar). `(admin)` waits for Phase 3.
3. **Types** (`types/index.ts`) — add `Homework`, `HomeworkSubmission`, `HomeworkStatus`, `TeacherClass`, `RosterEntry`, `ClassEnrollment`. (`Notification`/`NotificationType` already exist.)

### Slices — recommended order (ALL SHIPPED ✅ — kept for reference)

**2D — Homework (student side) — FIRST.** Backend READY. Completes the student loop.
- `lib/api/homework.ts`: `list()`, `get(id)`, `submit(id)`.
- `(student)/homework` list + `(student)/homework/[id]` detail; status badges (assigned/submitted/graded). If exam-backed (`homework.exam`), "Start" launches a session via `sessionAPI.start` → the Phase 1 test engine; otherwise a simple submit. Add a Sidebar nav entry.

**2E — Notifications UI.** Backend READY; `Notification` type already exists. Small, high-visibility.
- `lib/api/notifications.ts`: `list({unread?})`, `unreadCount()`, `markRead(id)`, `markAllRead()`.
- Navbar bell + unread badge (TanStack Query `refetchInterval` on `unread-count`); dropdown of recent; `(student)/notifications` page (cursor list, mark-read, mark-all). Deep-link via `notification.data` action URL.

**2F — Teacher surface.** Backend READY for classes/roster/enroll/homework.
- New `(teacher)` route group + role-guarded layout.
- `lib/api/teacher.ts`: classes list/create, roster, enroll; homework create + submissions.
- Pages: classes list + create dialog; class detail (roster `table` + enroll-by-email form); homework assign (form: class `select`, exam `select`, due date, `textarea`) + submissions view (`table`, status per student).
- ✅ **Teacher per-student analytics** — `GET /teacher/students/{id}/analytics/` (own-class-scoped via `CanViewStudentData`; admin any) returns `{student, summary, progress}`; roster names link to `(teacher)/teacher/students/[id]` → drilldown (`components/teacher/StudentAnalytics.tsx`, reuses the analytics chart). Shipped.

### 2G — Gap-closing (found in post-2F review) — SHIPPED ✅
1. ✅ **Exam-backed homework auto-submit** — `POST /homework/{id}/start/` starts the linked exam AND binds the session to the student's submission (`HomeworkSubmission.session`); the assessments submit view flips linked submissions to `submitted` (lazy `apps/homework/services.py` call). Manual submit stays for plain homework / as fallback. Frontend Start button uses `homeworkAPI.start`.
2. ✅ **Mobile navigation** — Navbar hamburger (`md:hidden`) → left drawer (`components/common/MobileNav.tsx`) with the role-aware items (teacher items inside `/teacher/*`); nav arrays + role filter exported from the sidebars.
3. ✅ **Localized notification content** — `notify()` payloads carry structured data (`homework_title`, `class_name`, `due_at`, `exam_title`); client renders per-type EN/UZ templates (`components/notifications/render.ts`), falling back to server title/body for unknown types/old rows.
4. ✅ **`send_homework_due_reminders()`** — `apps/notifications/tasks.py`: daily beat task (CELERY_BEAT_SCHEDULE, installed into the DB by django_celery_beat on beat startup) — `homework_due` to actively-enrolled, unsubmitted students for homework due within 24h, deduped per user+homework.
5. ✅ **Notifications polish** — All/Unread filter on the notifications page + `e2e/notifications.spec.ts` (bell → localized template → deep link → linked-test auto-submit → mark-all-read).

### Phase 1 retro-fixes (found in post-Phase-2 audit) — SHIPPED ✅
1. ✅ **Grid-in equivalence grading** — grading is exact string match (`services.py` `strip().lower()` equality; same naive compare in `QuestionStudy`), so `3.5` vs `7/2`, `.5` vs `0.5`, `36.0` vs `36` are mismarked while the UI promises "Fractions (7/2) and decimals (3.5) are allowed". Fix: exact rational comparison (backend `answers_match()` via `Fraction`; frontend `lib/utils/answers.ts` via BigInt cross-multiplication), string fallback for non-numeric answers (MCQ letters unaffected).
2. ✅ **Abandoned-session sweep** — `ExamSession.Status.ABANDONED` is defined and rendered but nothing ever sets it; expired sessions sit on the dashboard as "Resume" forever. Fix: daily beat task `abandon_stale_sessions` (timed sessions expired >24h ago; untimed ones untouched >7 days); abandoned rows on the dashboard become non-clickable.
3. ✅ **Settings page** — `POST /auth/password/change/` had no UI, and profile fields (`sat_target_score`, `exam_date`, first/last name) had no endpoint or editor. Fix: `PATCH /auth/me/` (profile fields only — email/role immutable) + `(student)/settings` with Profile and Change-password forms; sidebar/mobile-nav entry.
4. ✅ **Dashboard exam-type filter** — `AvailableTests` listed every template type as "Practice tests". Fix: filter `type=practice` (backend already supports `?type=`).

### Conventions
As Phase 1 (see §2, §6, §8). Role-scoped routing via route groups + `RequireRole`. All new text through `useT` (en + uz). Server state via TanStack Query; **Zustand only** for the test engine. Lists cursor-paginated. Teacher endpoints are already own-class-scoped server-side.

### Verification (per slice)
`npm run type-check` + `lint` + `vitest` clean; `next build` (⚠️ stop the dev server first — dev and build share `.next/` and corrupt each other); browser-verify against the live backend in **both en + uz** (seed: `seed_demo_exam` then `seed_demo_academy` — idempotent teacher/student creds + class + homework); extend the Playwright e2e for the new happy path (e2e runs `workers=1` — parallel auth writes lock the SQLite dev DB); keep both CI jobs green.

### Out of scope (Phase 3+)
Admin content studio / exam builder / user management (+ their REST endpoints); realtime (websocket) notifications; attendance; bulk CSV import UI; official SAT scaling refinements; deployment/infra.

---

## PHASE 3 — ADMIN AUTHORING & PLATFORM MANAGEMENT

> **Goal:** expose the admin surfaces — user management, content studio (question
> authoring/review), and exam builder + assignments. Unlike Phases 1–2 (frontend
> against a ready backend), **every Phase 3 slice is backend-first**: the models,
> lifecycle methods, and Django admin already exist, but there are **no REST
> endpoints** — each slice adds the `/api/v1/admin/…` endpoints, then the
> role-gated `(admin)` UI.

### Backend readiness (verified) — the gap Phase 3 fills
- `/api/v1/admin/` is already mounted (`config/urls.py` → `apps/identity/urls_admin.py`, currently an empty stub). Mount admin endpoints here: fill `identity/urls_admin.py`, add `question_bank/urls_admin.py` + `assessments/urls_admin.py`.
- **Reuse — do NOT duplicate:** `IsAdmin` (`common/permissions.py`); `success_response`/`created_response`/`no_content_response` (`common/responses.py`); `BaseModel.soft_delete`; existing read serializers (extend for writes); the Django admin registrations prove the data model is sound.
- Models already exist (Phase 3 only exposes them over REST):
  - **Content** (`apps/question_bank/models.py`): `Question` — status `draft/review/published/archived`; methods `submit_for_review()`, `approve(reviewer)`, `reject(reviewer, note)`; versioning via `version` + `parent`. Plus `QuestionReview` (audit), `QuestionChoice`, `QuestionCategory` (tree), `QuestionTag`.
  - **Exams** (`apps/assessments/models.py`): `ExamTemplate` / `ExamSection` / `ExamQuestion` / `ExamAssignment`.
  - **Users** (`apps/identity/models.py`): `User` — role `public/student/teacher/admin`, soft-delete.

### Frontend readiness (reuse — do NOT rebuild)
- Role-gating: `components/common/RequireRole.tsx`. Add an `(admin)` route group + layout mirroring `(teacher)`: `<RequireRole roles={['admin']}>` + an admin Navbar/Sidebar.
- All UI primitives present (`ui/{table,select,textarea,dropdown-menu,dialog,…}`). API client (`get/post/patch/del/getPaginated`), TanStack Query (`useMutation` for writes), i18n (`useT`; **add every key to BOTH `en.ts` + `uz.ts`**), `parseApiError` + toasts.

### Slices — recommended order (dependency-aware; all three in scope)

**3A — User management. — SHIPPED ✅** (branch `feat/phase3-admin`)
- Backend (`apps/identity/views_admin.py` + `serializers_admin.py` + `urls_admin.py`): `GET /admin/users/` (filter role/active/verified + `include_deleted`, search email/name, cursor-paginated), `POST /admin/users/`, `GET/PATCH/DELETE /admin/users/{id}/` (DELETE = soft), `PATCH /admin/users/{id}/role/`, `POST /admin/users/{id}/deactivate|reactivate|set-password/`. All `IsAdmin`; self-action guards (can't deactivate/delete/demote self); reactivate also clears soft-delete. `seed_demo_admin` (admin@dsat.local / DevAdmin123!) + 29 endpoint tests. (Deferred stretch: bulk CSV import.)
- Frontend: `(admin)` route group + `RequireRole roles={['admin']}` layout (Navbar + `AdminSidebar`); `lib/api/admin/users.ts` (+ vitest); `AdminUser` type; `/admin/users` = searchable/filterable/cursor-paginated table + create/edit dialog + row actions (role, set-password, deactivate/reactivate, soft-delete); admin-panel entry in student sidebar + mobile nav; full en/uz `admin.*`. Browser-verified (list/create/delete, EN+UZ).

**3B — Content studio (question authoring + review). — SHIPPED ✅** (branch `feat/phase3-admin`)
- Backend (`apps/question_bank/{views_admin,serializers_admin,services,urls_admin}.py`, mounted at `/api/v1/admin/` alongside identity admin): question CRUD (all statuses, inline choices, MCQ/grid-in validation), **draft-only** in-place edit, lifecycle `submit-for-review|approve|reject` (wrap the model methods; approve/reject record `QuestionReview` rows), **§9 versioning** (`new-version` clones a published question → draft revision with `parent` chain; approving the revision archives the parent), `reviews` + `revisions` endpoints, and category/tag CRUD (in-use guards). All `IsAdmin`, cursor-paginated question list. `services.py` = versioning helpers. 30 endpoint tests; full lifecycle HTTP-smoke-tested.
- Frontend: `/admin/questions` list (status/module filter + search + row lifecycle actions; `status=review` = review queue) + `QuestionEditor` (create + edit) with **live KaTeX preview** (reuses `MarkdownMath`), draft-only editing (published = read-only + new-version), and inline review workflow (submit/approve/reject-with-note + history). `lib/api/admin/{questions,taxonomy}.ts`; `AdminQuestion*` types; full en/uz `admin.questions.*`. type-check + lint + vitest + build green. **Deferred:** categories/tags management UI (backend CRUD exists; editor uses category selector), tag/image/source fields in the editor, admin-questions e2e + browser verification (port 3000 was held by another session).

**3C — Exam builder + assignments. — SHIPPED ✅** (branch `feat/phase3-admin`)
- Backend (`apps/assessments/{views_admin,serializers_admin,urls_admin}.py`, third mount at `/api/v1/admin/`): `ExamTemplate` CRUD (filters + search + soft-delete); nested sections (auto section-numbering + duplicate guard) and section questions (add **published-only** + dedupe + append, **reorder-as-permutation** via a position-offset swap, remove); `ExamAssignment` CRUD (assign to a class **or** a student — exactly-one + schedule validation, `max_attempts`) + `GET /admin/assignments/{id}/sessions/` (per-student progress + score). All `IsAdmin`, cursor-paginated lists. 22 endpoint tests; full builder+assignment flow HTTP-smoke-tested.
- Frontend: `/admin/exams` list + create dialog + per-exam `ExamBuilder` (add/remove sections, published-question picker with search, up/down reorder, remove); `/admin/assignments` list + create dialog (exam + class-or-student target + schedule + attempts) + progress dialog. Class list reuses the teacher endpoint (admins see all); students from the admin users list. `lib/api/admin/exams.ts`; `AdminExam*`/`AdminAssignment*` types; Exams + Assignments nav; full en/uz. type-check + lint + vitest + build green. **Deferred:** exam-meta inline edit, section edit UI, assignment edit, browser verification + e2e (port 3000 held by another session).

### Conventions
As Phases 1–2 (see §2, §6, §8, §9, §11). Every admin endpoint is `IsAdmin`, under `/api/v1/admin/`, standard `{success,data,meta}` envelope, cursor pagination, soft-delete. **Never in-place edit a PUBLISHED question** — version it (§9). All admin text through `useT` (en + uz). Server state via TanStack Query; **Zustand only** for the test engine.

### Verification (per slice)
Backend: `pytest` (endpoint auth + validation + state transitions) + `ruff` + `black --check` + `makemigrations --check`. Frontend: `type-check` + `lint` + `vitest` + `next build`; browser-verify the `(admin)` surface as an `admin` user (seed via `/admin/` or a `seed_demo_admin` command) in **both en + uz**; extend the Playwright e2e; keep both CI jobs green.

### Out of scope (Phase 4+)
Realtime (websocket) notifications; attendance tracking; official SAT scaling refinements; analytics warehouse / OpenSearch; deployment / infra; public marketing site.

---

## PHASE 4 — SUPPORT CENTER

> **Goal:** a new student **Support Center** (left-sidebar section) + teacher/admin surfaces giving
> students proactive & on-demand academic help: **Book a Teacher** (1:1), **Ask a Question** (async
> Q&A), **Office Hours** (group), an **Academic Mentor** layer, and — the headline — a **proactive
> Support Session Trigger** that detects struggle from analytics and recommends a booking *before*
> the problem grows. Builds on the Phase 4 foundation already shipped (F1 roles/permissions,
> F2 attachments, 4A teacher dashboard, 4D StudentProfile+Guardians).
> **Status:** plan LOCKED. **SUPPORT CENTER COMPLETE — S0–S7 all shipped** (branch `feat/phase4-teacher-crm`). **S0**: `apps/support`
> skeleton (enums · scoping · `/api/v1/support/` mount · 10 `Notification.Type` · nav · en/uz stub).
> **S1 (Book a Teacher)**: `TeacherAvailability`/`SupportBooking`/`SessionOutcome`/`SessionRating`,
> `generate_slots` (settings.TIME_ZONE), `change_booking_status`, booking notifications; student wizard +
> My Sessions (cancel/rate) + teacher dashboard (confirm/complete/no-show/cancel/outcome) + availability
> editor. **S2 (Ask a Question)**: `SupportTicket` (shared pool; immutable `answered_at`)/`TicketReply`/
> `SupportTicketAttachment` (owner-validated); student ask (with file attachments) + thread; staff Questions
> tab (queue + reply/assign/close-reopen); `support_reply` notifications. **S3 (support analytics, fast-follow
> pulled forward)**: `analytics_services.py` KPIs (no-show rate, avg rating [null≠0], avg wait, utilization via
> generate_slots, ticket avg-response) over S1+S2, staff-scoped (own vs all); teacher Overview tab (KPI cards +
> lazy bookings-by-status chart) + student summary strip. **S4 (Support Session Trigger — the headline)**:
> `analytics.batch_weak_topics` + `SupportRecommendation` (+ `source_recommendation` FK on `SupportBooking`) +
> `rules.py` (thresholds mirror `RISK_*`) + `run_support_sweep` beat/command (dedupe, notify-once, expiry,
> N-independent reads); dashboard banner deep-links into the S1 wizard (`?subject=&topic=&rec=`), booking flips
> the rec to ACTED. **S5 (Office Hours — fast-follow)**: `OfficeHour`→`OfficeHourSession`→`OfficeHourAttendance`;
> `materialize`/reminder beats; capacity-guarded join/leave; student browse + teacher templates/roster/cancel/
> attendance. **S6 (Academic Mentor — in `apps/academy`)**: `StudentProfile.mentor` FK over append-only
> `MentorAssignment` (unique active/student) + `MentorCheckIn` + `ParentContactLog`; **mentor-FK row-scoping
> (404, distinct from class scoping)**; auto-close on graduate/drop; weekly check-in reminder; teacher
> `/teacher/mentees` surface + admin assign-by-email. **S7 (Admin ops dashboard — final slice)**: `SupportOpsDaily`
> flow-metric rollup + daily beat + `IsAdmin` overview/rebuild endpoints + `(admin)/admin/support-ops` (KPI cards +
> bookings-by-status + daily trend). All verified end-to-end in the browser (EN+UZ) + Playwright e2e. **SUPPORT
> CENTER COMPLETE — S0–S7 all shipped.** Full design doc lived in a session scratchpad; this section is the
> durable record.

### Locked decisions (owner, 2026-07-05)
1. **MVP = S0 + S1 + S2 + S4** (foundations · book-a-teacher · ask-a-question · proactive trigger). S3/S5/S6/S7 fast-follow.
2. **1:1 session format = in-person, optional `join_url`** (no Zoom/Meet integration).
3. **Bookable scope = ANY academy teacher by subject** — bookable set = distinct teachers with an active `TeacherAvailability` in the subject (availability carries `subject`); **no separate teacher directory**. A teacher opts in by publishing hours. Staff booking views still row-scope by the `teacher` FK.
4. **Trigger thresholds aligned to `analytics.RISK_*`** (inactivity red 14 / yellow 7; homework <50% red / <75% yellow; trend −10 / −5) + per-category accuracy `SUPPORT_CATEGORY_ACCURACY_RED = 55` (≠ overall `RISK_ACCURACY_RED = 50`).

### Reuse — do NOT rebuild
`common/permissions.py` (`IsAcademyStudent`, `IsAnyStaff` read, `IsOperationsStaff` write, `IsAdmin`, `IsAdminOrAcademicManager`); **`apps/academy/scoping.py`** (`scoped_students`/`scoped_student_or_404`/`scoped_classes`) — every staff endpoint = coarse permission class **+** per-row `scoped_*` (out-of-scope → **404**); academy CRM (`StudentProfile`, `Guardian`, `ClassEnrollment`); `analytics/services.py` signals (`_batch_signals`, `weak_topics`, `risk_assessment`, `batch_student_metrics`, `RISK_*`); `notifications.notify()` + client `render.ts`/`link.ts` (deep-link via `data.url`); `files.Attachment` + `POST /files/` + `filesAPI.upload`; frontend route groups + `RequireRole` + `lib/api/client.ts` (camel↔snake) + TanStack Query + shadcn/ui + i18n `useT` (EN **and** UZ — uz typed `as Dictionary`, missing key fails the build).

### Architecture
New **`backend/apps/support/`** owns booking, tickets, office-hours, trigger, and support-analytics (shares one `Subject` enum, one `change_*_status` transition-service pattern, one `support/scoping.py` composing `academy.scoping`). **Mentor lives in `apps/academy`** (anchor = `mentor` FK on `StudentProfile`; `ParentContactLog` → `Guardian`) — putting it in `support` would force a backward model dep. One-way deps: `support → academy / analytics / notifications / files / common / identity` (cross-app calls = **lazy imports** inside functions/tasks). Files: `models · enums · serializers · services · availability.py · rules.py · scoping.py · analytics_services.py · views{,_staff,_admin} · urls{,_admin} · tasks`.
**Frontend surfaces:** student `(student)/support/*`; teacher `(teacher)/teacher/{support,availability,office-hours,mentees}`; admin `(admin)/admin/support-ops`.

### Canonical data model
**Shared enums (`support/enums.py`, defined once):** `Subject` (`math`|`reading_writing`), `BookingStatus` (`pending`|`confirmed`|`completed`|`cancelled`|`no_show`), `TicketStatus` (`open`|`answered`|`closed`), `Priority` (`low`|`normal`|`high`), `RSVPStatus` (`joined`|`left`), `SessionStatus` (`scheduled`|`canceled`|`completed`), `RecSeverity` (`info`|`warning`|`critical`), `RecStatus` (`new`|`acted`|`dismissed`|`expired`|`superseded`). All models = `BaseModel` (UUID pk, soft-delete); reads filter `deleted_at__isnull=True`.
**`apps/support`:** `TeacherAvailability` (teacher, subject, weekday 0–6, start/end time, `slot_minutes` 30, is_active); `SupportBooking` (student, teacher **PROTECT**, subject, topic, reason, `scheduled_at`, duration, `actual_duration_minutes`, status, **`confirmed_at`/`completed_at`/`cancelled_at`** [analytics needs these up front], `join_url`, `source_recommendation` FK; partial unique `(teacher,scheduled_at)` on live statuses); `SessionOutcome` (O2O booking; `topics_covered`/`homework`/`next_recommendation` student-visible, **`notes` staff-only — enforced by a separate `StudentOutcomeSerializer`, not a comment**); `SessionRating` (O2O booking; 1–5 + comment; student rates teacher; only when `completed`); `SupportTicket` (student, subject, body, priority, status, `assigned_to` null=pool, **`answered_at` = immutable first-answer**, `last_reply_at`); `TicketReply` (thread; `is_staff_answer`); `SupportTicketAttachment` (link to `files.Attachment`, validates owner); `OfficeHour` (recurring group template; capacity 25, `open_to_all`) → `OfficeHourSession` (dated occurrence, snapshot) → `OfficeHourAttendance` (RSVP + `attended`; capacity via `select_for_update`); `SupportRecommendation` (student, `rule_key`, severity, status, subject/topic, `evidence` JSON, `notification` FK, `booking` FK, `expires_at`); `SupportOpsDaily` (admin rollup, `date` unique, hard-upsert, soft-delete-exempt).
**`apps/academy` additions:** `StudentProfile.mentor` (+ `mentor_assigned_at/by`, read-only on serializer); `MentorAssignment` (append-only history; unique active per student via `UniqueConstraint(profile, condition=ended_at IS NULL)`); `MentorCheckIn` (weekly log); `ParentContactLog` (→ `Guardian`, validates guardian belongs to student).
**Notifications:** 10 new `Notification.Type` values (`booking_requested/confirmed/cancelled/completed`, `support_reply`, `office_hours_reminder/canceled`, `support_recommendation`, `mentor_assigned`, `mentor_checkin_due`; all ≤30 chars → one `AlterField` migration) + FE `render.ts`/`link.ts` branches (EN+UZ).

### Server-authoritative rules
Booking status via `change_booking_status(booking, new, *, by)` (copy `academy.services.change_student_status`: `_ALLOWED_TRANSITIONS` + `ValueError` → 400); stamps `confirmed_at`/`completed_at`/`cancelled_at`; `confirmed → no_show` requires `scheduled_at < now()`. **No-double-book** = partial unique constraint **+** `select_for_update` (⚠️ **Postgres-only**; SQLite dev/CI enforces neither — those concurrency tests must target Postgres). **One `generate_slots(teacher, subject, range)` helper** in `support/availability.py`, imported by both the slots endpoint and utilization analytics (never two slot definitions); materializes in `settings.TIME_ZONE` (NOT per-user `User.timezone`, which stays display-only). Waiting-time = `Avg(confirmed_at − created_at)` excluding null; no-show rate = `no_show / (completed + no_show)`. Empty data → null avg rating, never `0.0`.

### Proactive trigger (S4 — the priority)
`support/rules.py :: RULE_REGISTRY` (hardcoded constants, mirroring `RISK_*`): `category_accuracy_low` (per weak category, per-category accuracy < 55), `score_trend_declining` (practice-accuracy trend over all `ExamResult`s — **not** mock-specific), `inactive_days`, `homework_completion_low`. **Prerequisite:** a NEW `analytics.batch_weak_topics(user_ids)` grouped helper (avoids N+1 in the sweep — must land before S4). Beat task `apps.support.tasks.sweep_support_triggers` (daily 06:00, registered in `CELERY_BEAT_SCHEDULE` in `config/settings/base.py`): cohort = active-enrolled students; per batch call `_batch_signals` + `batch_weak_topics` **once**; dedupe = model-level existence on `(student, rule_key, status IN [new,acted])` (single, sufficient guard); `notify()` once per student per sweep (highest severity) with `data.url` deep-linking `/support/book?subject=&topic=&rec=<id>`; booking-create reads `rec` → sets `source_recommendation` (server-authoritative "acted"). Fold expiry (`new` past `expires_at` → `expired`) into the sweep.

### Build slices (dependency-ordered; ⭐ = MVP)
| Slice | Scope | Depends on |
|---|---|---|
| **S0** ⭐ | app skeleton + `enums.py` + `support/scoping.py` + URL mounts + `nav.support` + `support.*` i18n stub + 10 `Notification.Type` (one migration). No feature. | — |
| **S1** ⭐ | Book a Teacher: `TeacherAvailability`, `SupportBooking`, `SessionOutcome` (2 serializers), `SessionRating`; `generate_slots`; `change_booking_status`; student wizard + My Sessions + rating; teacher dashboard + availability editor + outcome form. | S0 |
| **S2** ⭐ | Ask a Question: `SupportTicket`/`TicketReply`/`SupportTicketAttachment`; student ask/tickets/thread; staff queue + reply/assign/status. | S0 |
| **S4** ⭐ | Support Session Trigger: `analytics.batch_weak_topics` (first), `SupportRecommendation`, `rules.py`, `sweep_support_triggers` + `run_support_sweep` cmd; dashboard banner + deep-link into S1. | S1, analytics |
| **S3** | Support analytics + student/teacher surfaces (reads S1+S2). | S1, S2 |
| **S5** | Office Hours (group): 3 models + `materialize`/`reminder` beats; student browse/join/leave; teacher templates + roster. | S0 |
| **S6** ✅ | Academic Mentor (in `apps/academy`): mentor FK + `MentorAssignment`/`MentorCheckIn`/`ParentContactLog`; mentor-FK row-scoping (404); auto-close on lifecycle change; weekly check-in reminder; teacher mentee surface + admin assign-by-email. **SHIPPED.** | academy CRM |
| **S7** ✅ | Admin ops dashboard: `SupportOpsDaily` rollup (flow metrics) + daily beat + `IsAdmin` overview/rebuild endpoints + `(admin)/admin/support-ops` (KPI cards + bookings-by-status + daily trend). **SHIPPED.** | S1, S2, S4, S5 |

### Frontend
Nav: push `nav.support` (`academyOnly`, `LifeBuoy`) onto `STUDENT_NAV`; teacher items onto `TEACHER_NAV`; `admin.nav.supportOps` onto `ADMIN_NAV` (MobileNav picks up automatically). New `lib/api`: `support.ts`, `support/officeHours.ts`, `support-analytics.ts`, `admin/support-ops.ts`, `mentor.ts` (camelCase bodies). Types in `src/types/index.ts` (student `SessionOutcome` type **omits `notes`**). Charts lazy `next/dynamic(ssr:false)` (clone the analytics chart). State = TanStack Query only (Zustand stays test-engine-only). i18n namespaces `support.*`, `mentor.*`, `teacher.{support,availability,officeHours,mentees}.*`, `admin.supportOps.*`, `notifications.templates.*` — **every key in EN + UZ**.

### Verification (per slice)
Backend `pytest` (two-layer gating → 404-not-403; booking transition guards incl. no-show time guard; **Postgres-only** no-double-book + capacity race [skip/xfail on SQLite]; `answered_at` immutability; trigger boundary + N-independent `assertNumQueries` sweep + dedupe = one row + one notification; mentor unique-active + guardian validation) + `ruff` + `black --check` + `makemigrations --check`. Frontend `type-check` + `lint` + `vitest` (`render.ts` EN+UZ, en/uz key parity, student outcome has no `notes`) + `next build` (stop dev server first). Playwright e2e (English, `workers=1`): book · ask · office-hours · trigger (seed struggling student → `run_support_sweep` → banner → prefilled booking → rec flips `acted`) · mentor.

### Out of scope (Support Center v1)
Payments/billing; realtime (websocket) chat & student→mentor messaging; video/meeting integration (store `join_url` string only); office-hours waitlist/auto-promote; a DB-editable rules table; per-user scheduling timezones (`User.timezone` display-only); `public` (non-academy) users (whole section is `IsAcademyStudent`-gated).

---

*Oxirgi yangilangan: Phases 1–2 COMPLETE (merged to main). **Phase 3 COMPLETE + follow-ups** (branch `feat/phase3-admin`; core merged to main via [PR #5](https://github.com/Viltrumlik/dsat-lms/pull/5), follow-ups + verification in [PR #6](https://github.com/Viltrumlik/dsat-lms/pull/6)): **3A** admin user management (+ post-audit hardening + bulk CSV import), **3B** content studio (authoring + review lifecycle + §9 versioning + categories/tags management UI + tag/source editor fields), **3C** exam builder + assignments (+ assignment/exam-meta edit dialogs). All with `/api/v1/admin/` endpoints (identity + question_bank + assessments — three includes at one prefix) + `(admin)` UI. **Verified:** backend 234 pytest; frontend type-check + lint + 63 vitest (incl. admin render tests) + build; **browser-verified 3A/3B/3C in EN+UZ**; Playwright e2e for all three (`admin`, `content-studio`, `exam-builder` specs). Deferred (low-value): section-title inline edit; repo-wide drf-spectacular `serializer_class` (OpenAPI docs).*

***Phase 4 IN PROGRESS** (branch `feat/phase4-teacher-crm`): foundation shipped — F1 roles/permissions, F2 attachments pipeline, 4A teacher dashboard, 4D StudentProfile+Guardians CRM. **Support Center** designed + LOCKED (see the "PHASE 4 — SUPPORT CENTER" section above); MVP = S0+S1+S2+S4. **S0 + S1 SHIPPED** (commits 7d3ef56 S0, a3bd9aa S1 backend, ede5ba2 S1 frontend). **S0** = `apps/support` skeleton (enums + academy-composed scoping + `/api/v1/support/` mount + 10 `Notification.Type` in one migration + nav + en/uz stub). **S1 (Book a Teacher)** = `TeacherAvailability`/`SupportBooking` (partial-unique no-double-book, server-stamped timestamps)/`SessionOutcome` (staff-only notes)/`SessionRating`; `generate_slots` (single slot def, settings.TIME_ZONE); `change_booking_status` (guarded, no-show time guard); booking_* notifications; student wizard + My Sessions (cancel/rate) + teacher dashboard + availability editor; row-scoped staff endpoints (404 out-of-scope). Verified: 375 pytest + ruff/black/makemigrations; frontend type-check/lint/vitest 71/`next build`; **browser-verified E2E** (student book → teacher confirm → notification, TZ round-trip) + Playwright `support.spec.ts`; adversarial cross-stack review clean (1 low fixed: teacher-only availability nav). **S2 (Ask a Question)** (commits 3f98d1c backend, 1ab4079 frontend, 504d597 review-fix) = `SupportTicket` (shared staff pool, `assigned_to` null=unclaimed, immutable `answered_at`, `last_reply_at`)/`TicketReply` (`is_staff_answer`; first staff answer → answered)/`SupportTicketAttachment` (links `files.Attachment`, owner-validated); student ask dialog (subject/priority/body + file attachments) + tickets list + thread (reply, close/reopen); teacher `/teacher/support` now **tabbed** (Sessions | Questions) with the ticket queue (status/assignee filters + thread dialog: answer, assign-to-me, close/reopen); `support_reply` notifications (`?tab=questions` deep-link); `filesAPI.download` (auth'd blob). Verified: 399 pytest; frontend type-check/lint/vitest 73/build; **browser-verified E2E** (student ask → teacher answer → answered + notification → student reads) + Playwright `support-tickets.spec.ts`; adversarial review (1 medium fixed: staff can now download ticket-linked attachments — `can_access_attachment` grants academy staff on ticket-linked files). **S3 (support analytics — fast-follow pulled forward)** (commits ff952c6 backend, 47cbe8b frontend) = `support/analytics_services.py` KPIs over S1+S2: booking (status counts, no_show_rate=no_show/(completed+no_show), avg_rating [null not 0.0], avg_wait_minutes=Avg(confirmed_at−created_at), utilization=forward booked/(booked+free) reusing generate_slots) + ticket (status counts, avg_response_minutes, answered_by_me); staff-scoped (teacher own via scope_teacher_rows / full-access all, utilization null for aggregate); student self-summary. `GET /support/staff/analytics/` (IsAnyStaff) + `GET /support/analytics/` (student). Frontend: teacher **Overview tab** (KPI cards + lazy Recharts bookings-by-status chart) + student `SupportSummaryStrip` on the landing; `support-analytics.ts`. Gotcha: client camelizes nested keys, so `by_status.no_show` → `byStatus.noShow`. Verified: 412 pytest; type-check/lint/vitest 73/build; browser-verified Overview KPIs+chart. **S4 (Support Session Trigger — the headline)** (commits 1f684df backend, 4c05d23 frontend) = `analytics.batch_weak_topics(user_ids)` (grouped, N-independent — the prerequisite) + `SupportRecommendation` (rule_key/severity/status/subject/topic/evidence JSON/notification+booking FKs/expires_at) + `source_recommendation` FK on `SupportBooking`; `rules.py` RULE_REGISTRY (thresholds mirror `analytics.RISK_*`: category<55 [crit<40], trend<=-5/-10, inactive>=7/14, homework<75/50; severity crit/warn); `services.run_support_sweep` (cohort=active-enrolled; `_batch_signals`+`batch_weak_topics` once; dedupe on (student,rule_key) live; notify once/student highest-severity NEW rec with `/support/book?subject=&topic=&rec=` deep-link; folds NEW→EXPIRED); `create_booking(recommendation=)` sets source + flips ACTED; `tasks.sweep_support_triggers` beat (06:00) + `run_support_sweep` cmd + recommendations list/dismiss. Frontend: dashboard `SupportRecommendationBanner` (deep-link Book-help + dismiss, self-gates public) + BookingWizard reads `?subject/?topic/?rec` (prefill + carry rec); `support_recommendation` render + Sparkles icon; `seed_demo_academy` seeds a weak topic + runs the sweep. Verified: 432 pytest (incl. N-independent assertNumQueries sweep, dedupe, expiry); type-check/lint/vitest 75/build; **browser-verified full loop** (seed→sweep→banner→deep-link prefill→book→rec ACTED+booking linked→banner drops) + Playwright `support-trigger.spec.ts`. **S5 (Office Hours — fast-follow)** (commits 4feccb7 backend, 13a5b2c frontend) = `OfficeHour` (recurring weekly template) → `OfficeHourSession` (dated snapshot occurrence, unique per (office_hour, starts_at)) → `OfficeHourAttendance` (RSVP joined/left + `attended`); `office_hours.py`: `materialize` (idempotent, snapshots, skips past, 14-day horizon) + `join`/`leave` (capacity guard via `select_for_update` — Postgres-only race safety; idempotent; seat freed on leave) + `cancel` (notifies joined) + `send_office_hour_reminders` (24h window, deduped via `reminder_sent_at`) + `mark_attendance`; student browse/mine/join/leave + teacher templates CRUD + staff sessions/roster/cancel/attendance (row-scoped by teacher FK → 404); `materialize_office_hours`+`send_office_hour_reminders` beats (05:00/07:00); `office_hours_reminder`/`office_hours_canceled` notifications. Frontend: student browse page + landing tile; teacher `/teacher/office-hours` (templates editor + sessions + roster dialog w/ attendance checkboxes + cancel); teacher-only nav. Verified: 451 pytest; type-check/lint/vitest 78/build; **browser-verified** (teacher template→materialize→student join [24/25 seats]→teacher roster→mark attendance) + Playwright `support-office-hours.spec.ts`. **S6 (Academic Mentor — in `apps/academy`, not `support`)** (commits fdb6763 backend, 82099e6 backend addendum, 8f4d2f6 frontend) = `StudentProfile.mentor` FK (+ `mentor_assigned_at/by`, read-only on serializer) mirror over an append-only `MentorAssignment` history (UniqueConstraint(profile, condition `ended_at IS NULL AND deleted_at IS NULL`) = one active mentor/student) + `MentorCheckIn` + `ParentContactLog` (→ `Guardian`, validates guardian belongs to student). Services: `assign_mentor` (atomic close-prev+create+mirror+notify; `not_staff`/`same_mentor` guards), `unassign_mentor`, `log_mentor_check_in`, `log_parent_contact` (`guardian_mismatch`); `change_student_status` graduate/drop auto-closes mentorship. **New scoping axis** (`views_mentor.py` `_mentee_profile_or_404`): mentor FK, NOT class — a mentor sees only their mentees; full-access (`can_read_all_students`) sees any; out-of-scope → 404 (distinct from the class-scoped `/students/{id}/` profile). Endpoints: `POST /students/{id}/mentor/` (assign by `email` or `mentor` uuid, or null=unassign; `IsAdminOrAcademicManager`), `GET /students/{id}/mentee/` (mentor-scoped header + guardians for the parent-contact form), `GET/POST /students/{id}/checkins/` + `/parent-contacts/`, `GET /teacher/mentees/` (`MenteeSerializer` — last check-in via `Max` annotation). Weekly beat `send_mentor_checkin_reminders` (Mon 08:00; active mentees stale >7d; `mentor_checkin_due`) + `mentor_assigned` notify. Frontend: `/teacher/mentees` list + `/teacher/mentees/[id]` drilldown (check-in log+form, family-contact log+form w/ guardian dropdown) + `MentorAssignCard` on the student drilldown (admins only; assign-by-email/reassign/remove); "Mentees" teacher-nav; `render.ts` mentor branches (EN+UZ); `lib/api/mentor.ts`; `seed_demo_academy` assigns the demo teacher as the student's mentor + a guardian + a check-in. Verified: 478 pytest (assign/reassign/unassign, unique-active IntegrityError, auto-close, guardian_mismatch, mentor-scope 404, assign-by-email, mentee-detail scope, reminder) + ruff/black/makemigrations; frontend type-check/lint/vitest 81/build; **browser-verified EN+UZ** (mentee list→detail→add check-in→log family contact→admin reassign-by-email→restored) + Playwright `mentor.spec.ts`. **Adversarial review (commit 26f23ea) fixed 3 confirmed issues:** `_mentee_profile_or_404`/`MyMenteesView` now guard `user__deleted_at__isnull=True` (a soft-deleted mentee kept leaking to its mentor — account soft-delete doesn't close mentorship, and `User` uses a plain manager); `send_mentor_checkin_reminders` scopes staleness to the **current** mentor (`filter=Q(mentor_checkins__mentor=F("mentor"))`) so a reassigned student's new mentor is reminded despite a prior mentor's recent check-in. **S7 (Admin ops dashboard — the final slice)** (commits 536c183 backend, 2a2559a frontend) = `SupportOpsDaily` (BaseModel, unique `date`, hard-upsert via `update_or_create`, never soft-deleted) storing per-day **flow** metrics (bookings created/completed/cancelled/no-show + ratings, tickets created/answered + avg response, office-hours sessions/attendance, recommendation funnel) — all reconstructable from timestamps, so deterministic + backfillable; current-state (backlog/utilization) stays in the live endpoint. `ops.py`: `build_support_ops_daily` (day bounds in `settings.TIME_ZONE`, upsert) + `run_support_ops_rollup` (default today) + `admin_support_overview(days)` (live platform KPIs reusing S3 `booking_metrics`/`ticket_metrics` over the full tables + a continuous last-N-day series, zeros/null for empty days). Endpoints (`IsAdmin`, `/api/v1/admin/`): `GET support-ops/` (summary + series, `?days=` clamped 1–90) + `POST support-ops/rebuild/`. Daily beat 01:00 (rolls up yesterday+today) + `run_support_ops_rollup` command; `seed_demo_academy` rolls up today. Frontend: `/admin/support-ops` (`SupportOpsView`: 8 KPI cards + bookings-by-status [reuses S3 `SupportBookingsChart`] + lazy daily-activity `LineChart` `SupportOpsTrendChart`, day-window Select + on-demand Rebuild); `lib/api/admin/support-ops.ts`; `SupportOpsOverview`/`Summary`/`DailyPoint` types (camelized); "Support ops" `ADMIN_NAV` entry; full en/uz `admin.supportOps.*`. Verified: 478+125 pytest (10 S7: flow metrics, idempotency, empty=zeros/null, admin gate 403, series shape, days clamp, rebuild, trailing-window recapture) + ruff/black/makemigrations; frontend type-check/lint/vitest 81/build; **browser-verified EN+UZ** (KPIs + both charts + rebuild) + Playwright `support-ops.spec.ts`. **Adversarial review (commit fe8c7a0) fixed 2 confirmed (low) findings, same root cause:** `bookings_no_show` (keyed on `scheduled_at`) + `office_hours_attended` (keyed on `session.starts_at`) count events MARKED later (no-show flip / attendance mark); the beat only re-rolled yesterday+today, so late marks fell outside the window and were undercounted in the historical series (live KPIs unaffected). Fix keeps the session-day attribution but widens the finalization window — `rollup_recent()` re-rolls a trailing `ROLLUP_TRAILING_DAYS`=7 window (idempotent); the beat + rebuild call it. **SUPPORT CENTER COMPLETE — S0–S7 all shipped.**\*

***Phase 5 — Admin Control Center COMPLETE** (branch `feat/phase5-admin-control-center`; all 7 waves shipped, commit-only — not yet merged to main). Turns the admin panel into an operational command center (~12 modules; **money/finance out of scope**). Durable per-wave record lives in the `phase5-admin-control-center` auto-memory. **5.0** foundations (shared UI primitives + `StatCard`; `identity.OrgSetting` singleton; `apps/audit` `ActivityLog` + explicit `record_activity()`). **5.1** control-center shell — nav sections + `GET /admin/search/` + ⌘K command palette; executive dashboard (`analytics.PlatformOpsDaily` rollup + live alerts via `batch_risk_assessments` + recent-activity feed + trend chart). **5.2** classroom ops — `ClassSession`+`Attendance` (folded into the risk engine) + `ClassScheduleRule`+`materialize_class_sessions` beat + Announcements (`Announcement`/`AnnouncementDelivery` idempotency key/`MessageTemplate` + pluggable in-app/email channel registry). **5.3** gradebook (read-service matrix, grade precedence manual>session-result>none) + reports (CSV stream / xlsx openpyxl; `?fmt=` NOT `format`) + platform analytics. **5.4** full course system (`apps/courses` Course→Unit→Lesson + assignments + `LessonProgress`; partial-unique active-only positions; student player + `completion_summary()` KPI). **5.5** CRM (`apps/crm` Leads pipeline + `IsFrontOffice` + 404-scoping + atomic email-deduped convert→student; `Tag`/`TaggedItem` GenericForeignKey; `StudentNote` + merged timeline; Student-360 directory + bulk + saved filters). **5.6 (final)** — **permissions matrix** (`identity.RolePermission` sparse DB overrides merged into `capabilities_for_role()`; enforcement stays role-based, NOT a per-user ACL; `GET/PUT /admin/permissions/matrix/`, cells as a list = camelization-safe, revert-to-default soft-deletes the row) + **automation engine** (`apps/automation` `AutomationRule`+`AutomationLog` [unique `(rule,subject,day)` idempotency]; **strict whitelisted typed condition DSL — never eval**: `catalog.py`+`conditions.py::clean_tree` bound depth≤4/children≤20, validate field/op/value-type, reject unknown keys; actions notify/add_tag/change_status [calls domain services directly — no re-entrancy]; `run_automation_sweep` reuses `_batch_signals` [N-independent]; `dispatch()` event seam at homework submit; `GET /admin/automation/catalog/` drives the recursive visual builder + dry-run test + run log; daily beat). Each wave = backend-first + `(admin)` UI, `IsAdmin`, `{success,data,meta}`, cursor pagination, soft-delete, EN+UZ, TanStack Query; adversarial review workflow at every wave boundary (5.4→9, 5.5→7, 5.6→8 confirmed findings, all fixed + regression-tested). **Verified:** backend **720 pytest** (final); frontend type-check + lint + 81 vitest + `next build`; browser-verified each `(admin)` surface. **Key patterns/gotchas:** `User` plain manager → cross-domain queries must filter `deleted_at__isnull=True`+`is_active` (and annotation `Count()` JOINs bypass `ActiveManager` — add explicit filters); dev backend `runserver --noreload` → restart after new URLs; dev StrictMode refresh-rotation logs you out on HARD browser navigation → navigate via in-SPA clicks; DSL JSON must use all-lowercase keys so the axios camel↔snake transform is a no-op.\*
