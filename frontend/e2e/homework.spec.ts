// Domain: E2E
// Description: Phase 2 homework happy path against the live backend —
//   a teacher creates a fresh assignment via the API (unique title per run),
//   then the seeded academy student finds it in /homework and submits it.
//
// Prerequisites (the webServer in playwright.config.ts only starts the frontend):
//   1. Backend running:  cd backend && source .venv/bin/activate && python manage.py runserver
//   2. Academy seeded:   python manage.py seed_demo_academy   (after seed_demo_exam)

import { test, expect, request, type APIRequestContext } from '@playwright/test'

const API_URL = (process.env.E2E_API_URL ?? 'http://localhost:8000') + '/api/v1'

async function apiLogin(email: string, password: string): Promise<{
  api: APIRequestContext
  headers: { Authorization: string }
}> {
  const api = await request.newContext()
  const res = await api.post(`${API_URL}/auth/login/`, { data: { email, password } })
  expect(res.ok(), `login as ${email} (did you run seed_demo_academy?)`).toBeTruthy()
  const body = await res.json()
  return { api, headers: { Authorization: `Bearer ${body.data.access_token}` } }
}

test('student sees assigned homework and submits it', async ({ page }) => {
  // Teacher: create a fresh assignment for this run via the API.
  const { api, headers } = await apiLogin('teacher@dsat.local', 'DevTeacher123!')
  const classesRes = await api.get(`${API_URL}/teacher/classes/`, { headers })
  const klass = (await classesRes.json()).data.find(
    (c: { name: string }) => c.name === 'SAT Morning Group'
  )
  expect(klass, 'seeded class exists').toBeTruthy()

  const title = `E2E homework ${Date.now()}`
  const createdRes = await api.post(`${API_URL}/homework/`, {
    headers,
    data: {
      title,
      description: 'Created by the e2e run — submit me.',
      assigned_class: klass.id,
      due_at: new Date(Date.now() + 2 * 86_400_000).toISOString(),
    },
  })
  expect(createdRes.status()).toBe(201)
  await api.dispose()

  // Student: sign in through the UI.
  await page.goto('/login')
  await page.getByLabel('Email').fill('student@dsat.local')
  await page.getByLabel('Password', { exact: true }).fill('DevStudent123!')
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page).toHaveURL(/\/dashboard/)

  // Homework list via the sidebar; the fresh assignment shows as Assigned.
  await page.getByRole('link', { name: 'Homework' }).click()
  await expect(page).toHaveURL(/\/homework$/)
  const row = page.getByRole('link', { name: new RegExp(title) })
  await expect(row).toBeVisible()
  await expect(row.getByText('Assigned')).toBeVisible()

  // Detail → submit (confirm in the dialog) → status flips to Submitted.
  await row.click()
  await expect(page.getByRole('heading', { name: title })).toBeVisible()
  await page.getByRole('button', { name: 'Submit homework' }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()
  await dialog.getByRole('button', { name: 'Submit homework' }).click()

  await expect(page.getByText('Submitted', { exact: true }).first()).toBeVisible()
  // The action buttons are gone once submitted.
  await expect(page.getByRole('button', { name: 'Submit homework' })).toHaveCount(0)
})
