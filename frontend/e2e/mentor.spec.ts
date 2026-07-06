// Domain: E2E
// Description: Phase 4 S6 academic-mentor happy path — the demo teacher is the
//   mentor of the demo student (seed_demo_academy). The teacher opens their
//   mentee list, drills into the mentee, logs a check-in, and logs a family
//   contact against the student's seeded guardian.
//
// Prerequisites (the webServer in playwright.config.ts only starts the frontend):
//   1. Backend running:  cd backend && source .venv/bin/activate && python manage.py runserver
//   2. Academy seeded:   python manage.py seed_demo_academy   (assigns the mentor)

import { test, expect, type Page } from '@playwright/test'

async function login(page: Page, email: string, password: string) {
  await page.goto('/login')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password', { exact: true }).fill(password)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page).toHaveURL(/\/dashboard/)
}

test('teacher logs a check-in and a family contact for a mentee', async ({ page }) => {
  await login(page, 'teacher@dsat.local', 'DevTeacher123!')

  // Mentee list → the seeded mentee.
  await page.goto('/teacher/mentees')
  await expect(page.getByRole('heading', { name: 'My mentees' })).toBeVisible()
  const menteeLink = page.getByRole('link', { name: /Aziza Karimova/ })
  await expect(menteeLink).toBeVisible()
  await menteeLink.click()

  // Drilldown header.
  await expect(page.getByRole('heading', { name: 'Aziza Karimova' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Check-ins' })).toBeVisible()

  // Log a check-in — it appears in the log.
  const note = `E2E check-in ${Date.now()}`
  await page.getByLabel('New check-in').fill(note)
  await page.getByRole('button', { name: 'Add check-in' }).click()
  await expect(page.getByText(note)).toBeVisible()

  // Log a family contact against the seeded guardian (Radix select).
  await page.getByRole('combobox', { name: 'Guardian' }).click()
  await page.getByRole('option', { name: /Nodira Karimova/ }).click()
  const contactNote = `E2E contact ${Date.now()}`
  await page.getByLabel('Note').fill(contactNote)
  await page.getByRole('button', { name: 'Log contact' }).click()
  await expect(page.getByText(contactNote)).toBeVisible()
})
