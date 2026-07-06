// Domain: E2E
// Description: Phase 4 Support Center S1 — a student books a 1:1 support session
//   through the Book-a-Teacher wizard (subject → teacher → slot → details) and
//   sees it in My Sessions as Pending.
//
// Prerequisites (the webServer in playwright.config.ts only starts the frontend):
//   1. Backend running:  cd backend && source .venv/bin/activate && python manage.py runserver
//   2. Academy seeded:   python manage.py seed_demo_academy   (seeds teacher availability)

import { test, expect, type Page } from '@playwright/test'

async function login(page: Page, email: string, password: string) {
  await page.goto('/login')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password', { exact: true }).fill(password)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page).toHaveURL(/\/dashboard/)
}

test('student books a 1:1 support session', async ({ page }) => {
  await login(page, 'student@dsat.local', 'DevStudent123!')

  // Support Center → Book a teacher.
  await page.getByRole('link', { name: 'Support Center' }).click()
  await expect(page).toHaveURL(/\/support$/)
  await page.getByRole('link', { name: /Book a teacher/ }).first().click()
  await expect(page).toHaveURL(/\/support\/book/)

  // Wizard: subject → teacher → slot → details.
  await page.getByRole('button', { name: 'Math', exact: true }).click()
  await page.getByRole('button', { name: 'Tohir Malik' }).click()
  // Slot buttons carry a "·" separator between date and time; take the first open one.
  await page.locator('button', { hasText: '·' }).first().click()
  await page.locator('#topic').fill(`E2E booking ${Date.now()}`)
  await page.getByRole('button', { name: 'Confirm booking' }).click()

  // Redirected to My Sessions showing the new pending booking.
  await expect(page).toHaveURL(/\/support\/sessions/)
  await expect(page.getByText('Tohir Malik').first()).toBeVisible()
  await expect(page.getByText('Pending').first()).toBeVisible()
})
