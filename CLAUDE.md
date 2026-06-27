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

*Oxirgi yangilangan: Arxitektura finalized — MVP boshlash tayyor.*
