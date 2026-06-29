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
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
    video: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'npm run dev',
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
})
