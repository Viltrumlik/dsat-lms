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
- ⚠️ **Deferred to Phase 3:** per-student analytics drilldown (needs `GET /teacher/students/{id}/analytics/`).

### 2G — Gap-closing (found in post-2F review) — SHIPPED ✅
1. ✅ **Exam-backed homework auto-submit** — `POST /homework/{id}/start/` starts the linked exam AND binds the session to the student's submission (`HomeworkSubmission.session`); the assessments submit view flips linked submissions to `submitted` (lazy `apps/homework/services.py` call). Manual submit stays for plain homework / as fallback. Frontend Start button uses `homeworkAPI.start`.
2. ✅ **Mobile navigation** — Navbar hamburger (`md:hidden`) → left drawer (`components/common/MobileNav.tsx`) with the role-aware items (teacher items inside `/teacher/*`); nav arrays + role filter exported from the sidebars.
3. ✅ **Localized notification content** — `notify()` payloads carry structured data (`homework_title`, `class_name`, `due_at`, `exam_title`); client renders per-type EN/UZ templates (`components/notifications/render.ts`), falling back to server title/body for unknown types/old rows.
4. ✅ **`send_homework_due_reminders()`** — `apps/notifications/tasks.py`: daily beat task (CELERY_BEAT_SCHEDULE, installed into the DB by django_celery_beat on beat startup) — `homework_due` to actively-enrolled, unsubmitted students for homework due within 24h, deduped per user+homework.
5. ✅ **Notifications polish** — All/Unread filter on the notifications page + `e2e/notifications.spec.ts` (bell → localized template → deep link → linked-test auto-submit → mark-all-read).

### Phase 1 retro-fixes (found in post-Phase-2 audit)
1. **Grid-in equivalence grading** — grading is exact string match (`services.py` `strip().lower()` equality; same naive compare in `QuestionStudy`), so `3.5` vs `7/2`, `.5` vs `0.5`, `36.0` vs `36` are mismarked while the UI promises "Fractions (7/2) and decimals (3.5) are allowed". Fix: exact rational comparison (backend `answers_match()` via `Fraction`; frontend `lib/utils/answers.ts` via BigInt cross-multiplication), string fallback for non-numeric answers (MCQ letters unaffected).
2. **Abandoned-session sweep** — `ExamSession.Status.ABANDONED` is defined and rendered but nothing ever sets it; expired sessions sit on the dashboard as "Resume" forever. Fix: daily beat task `abandon_stale_sessions` (timed sessions expired >24h ago; untimed ones untouched >7 days); abandoned rows on the dashboard become non-clickable.
3. **Settings page** — `POST /auth/password/change/` had no UI, and profile fields (`sat_target_score`, `exam_date`, first/last name) had no endpoint or editor. Fix: `PATCH /auth/me/` (profile fields only — email/role immutable) + `(student)/settings` with Profile and Change-password forms; sidebar/mobile-nav entry.
4. **Dashboard exam-type filter** — `AvailableTests` listed every template type as "Practice tests". Fix: filter `type=practice` (backend already supports `?type=`).

### Conventions
As Phase 1 (see §2, §6, §8). Role-scoped routing via route groups + `RequireRole`. All new text through `useT` (en + uz). Server state via TanStack Query; **Zustand only** for the test engine. Lists cursor-paginated. Teacher endpoints are already own-class-scoped server-side.

### Verification (per slice)
`npm run type-check` + `lint` + `vitest` clean; `next build` (⚠️ stop the dev server first — dev and build share `.next/` and corrupt each other); browser-verify against the live backend in **both en + uz** (seed: `seed_demo_exam` then `seed_demo_academy` — idempotent teacher/student creds + class + homework); extend the Playwright e2e for the new happy path (e2e runs `workers=1` — parallel auth writes lock the SQLite dev DB); keep both CI jobs green.

### Out of scope (Phase 3+)
Admin content studio / exam builder / user management (+ their REST endpoints); teacher per-student analytics; realtime (websocket) notifications; attendance; bulk CSV import UI; official SAT scaling refinements; deployment/infra.

---

*Oxirgi yangilangan: Phase 2 COMPLETE — Question Bank, Analytics, i18n, Homework (2D), Notifications (2E), Teacher surface (2F), gap-closing (2G: auto-submit, mobile nav, notification i18n, due reminders, unread filter) shipped (branch feat/phase2-question-bank). Keyingisi: Phase 3 — admin content studio / exam builder / user management (+ REST endpoints), teacher per-student analytics.*
