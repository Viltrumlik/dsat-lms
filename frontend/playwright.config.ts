import { defineConfig, devices } from '@playwright/test'

// E2E config for the Phase 1 happy path. Frontend is auto-started (or reused).
// The BACKEND must be running and seeded separately:
//   cd backend && source .venv/bin/activate && python manage.py runserver
//   python manage.py seed_demo_exam
// See e2e/happy-path.spec.ts for the flow it exercises.

const BASE_URL = process.env.E2E_BASE_URL ?? 'http://localhost:3000'

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  // Serial everywhere: the dev backend runs on SQLite, and parallel workers'
  // auth/submit writes collide ("database is locked" 500s). Revisit on Postgres.
  workers: 1,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  // The dev server compiles routes on first hit, so the first navigation into a
  // heavy route (e.g. the test engine, /session/[id]) can take well over the 5s
  // default. Give assertions and navigations room to absorb that cold compile.
  expect: { timeout: 20_000 },
  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
    video: 'retain-on-failure',
    navigationTimeout: 30_000,
    actionTimeout: 15_000,
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'npm run dev',
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
})
