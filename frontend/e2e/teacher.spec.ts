// Domain: E2E
// Description: Phase 2 teacher happy path against the live backend —
//   teacher signs in, sees their class, assigns homework through the dialog
//   (class select + due date), then the seeded student submits via the API and
//   the teacher sees the submission row flip to Submitted.
//
// Prerequisites (the webServer in playwright.config.ts only starts the frontend):
//   1. Backend running:  cd backend && source .venv/bin/activate && python manage.py runserver
//   2. Academy seeded:   python manage.py seed_demo_academy   (after seed_demo_exam)

import { test, expect, request, type Page } from '@playwright/test'

const API_URL = (process.env.E2E_API_URL ?? 'http://localhost:8000') + '/api/v1'

async function apiToken(email: string, password: string): Promise<string> {
  const api = await request.newContext()
  const res = await api.post(`${API_URL}/auth/login/`, { data: { email, password } })
  expect(res.ok(), `login as ${email} (did you run seed_demo_academy?)`).toBeTruthy()
  const body = await res.json()
  await api.dispose()
  return body.data.access_token
}

async function login(page: Page, email: string, password: string) {
  await page.goto('/login')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password', { exact: true }).fill(password)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page).toHaveURL(/\/dashboard/)
}

test('teacher assigns homework and sees the student submission', async ({ page }) => {
  await login(page, 'teacher@dsat.local', 'DevTeacher123!')

  // Teacher panel → classes list shows the seeded class.
  await page.getByRole('link', { name: 'Teacher panel' }).click()
  await expect(page).toHaveURL(/\/teacher\/classes/)
  // Both the class-name link and the chevron link carry the class name.
  await expect(page.getByRole('link', { name: /SAT Morning Group/ }).first()).toBeVisible()

  // Assign homework through the dialog.
  const title = `E2E teacher homework ${Date.now()}`
  await page.getByRole('link', { name: 'Homework' }).click()
  await expect(page).toHaveURL(/\/teacher\/homework$/)
  await page.getByRole('button', { name: 'Assign homework' }).click()

  const dialog = page.getByRole('dialog')
  await dialog.getByLabel('Title').fill(title)
  await dialog.getByRole('combobox').first().click()
  await page.getByRole('option', { name: 'SAT Morning Group' }).click()
  await dialog.locator('#hw-due').fill('2026-07-20T17:00')
  await dialog.getByRole('button', { name: 'Assign homework' }).click()
  await expect(dialog).toBeHidden()

  const row = page.getByRole('row', { name: new RegExp(title) })
  await expect(row).toBeVisible()

  // Student submits it via the API (the student UI path is covered in
  // homework.spec.ts) — the teacher's submissions view should reflect it.
  const studentToken = await apiToken('student@dsat.local', 'DevStudent123!')
  const api = await request.newContext()
  const listRes = await api.get(`${API_URL}/homework/`, {
    headers: { Authorization: `Bearer ${studentToken}` },
  })
  const homework = (await listRes.json()).data.find((h: { title: string }) => h.title === title)
  expect(homework, 'student sees the new homework').toBeTruthy()
  const submitRes = await api.post(`${API_URL}/homework/${homework.id}/submit/`, {
    headers: { Authorization: `Bearer ${studentToken}` },
  })
  expect(submitRes.ok()).toBeTruthy()
  await api.dispose()

  await row.getByRole('link', { name: title }).click()
  await expect(page).toHaveURL(new RegExp(`/teacher/homework/${homework.id}`))
  await expect(page.getByRole('heading', { name: title })).toBeVisible()
  const submissionRow = page.getByRole('row', { name: /Aziza Karimova/ })
  await expect(submissionRow).toBeVisible()
  await expect(submissionRow.getByText('Submitted', { exact: true })).toBeVisible()
})
