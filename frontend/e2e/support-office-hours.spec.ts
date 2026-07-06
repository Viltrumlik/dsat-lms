// Domain: E2E
// Description: Phase 4 Support Center S5 — a student browses office hours and joins
//   a group session. seed_demo_academy materializes sessions from a template.
//
// Prerequisites (the webServer in playwright.config.ts only starts the frontend):
//   1. Backend running:  cd backend && source .venv/bin/activate && python manage.py runserver
//   2. Academy seeded:   python manage.py seed_demo_academy   (materializes office hours)

import { test, expect, type Page } from '@playwright/test'

async function login(page: Page, email: string, password: string) {
  await page.goto('/login')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password', { exact: true }).fill(password)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page).toHaveURL(/\/dashboard/)
}

test('student joins an office-hours session', async ({ page }) => {
  await login(page, 'student@dsat.local', 'DevStudent123!')

  // Support Center → Office hours.
  await page.getByRole('link', { name: 'Support Center' }).click()
  await expect(page).toHaveURL(/\/support$/)
  await page.getByRole('link', { name: /Office hours/ }).first().click()
  await expect(page).toHaveURL(/\/support\/office-hours/)

  // Join the first session with a free seat → it flips to a Leave action.
  const join = page.getByRole('button', { name: 'Join' }).first()
  await expect(join).toBeVisible()
  await join.click()
  await expect(page.getByRole('button', { name: 'Leave' }).first()).toBeVisible()
})
