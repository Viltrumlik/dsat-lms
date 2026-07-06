// Domain: E2E
// Description: Phase 4 Support Center S2 — a student asks a question through the
//   Ask dialog and sees the new ticket in their list as Open.
//
// Prerequisites (the webServer in playwright.config.ts only starts the frontend):
//   1. Backend running:  cd backend && source .venv/bin/activate && python manage.py runserver
//   2. Academy seeded:   python manage.py seed_demo_academy

import { test, expect, type Page } from '@playwright/test'

async function login(page: Page, email: string, password: string) {
  await page.goto('/login')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password', { exact: true }).fill(password)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page).toHaveURL(/\/dashboard/)
}

test('student asks a support question', async ({ page }) => {
  await login(page, 'student@dsat.local', 'DevStudent123!')

  // Support Center → Ask a question.
  await page.getByRole('link', { name: 'Support Center' }).click()
  await expect(page).toHaveURL(/\/support$/)
  await page.getByRole('link', { name: /Ask a question/ }).first().click()
  await expect(page).toHaveURL(/\/support\/tickets/)

  const question = `E2E question ${Date.now()}: how do I factor?`
  await page.getByRole('button', { name: 'Ask a question' }).first().click()
  const dialog = page.getByRole('dialog')
  await dialog.locator('#ticket-body').fill(question)
  await dialog.getByRole('button', { name: 'Submit question' }).click()
  await expect(dialog).toBeHidden()

  // The new ticket shows in the list, Open.
  await expect(page.getByText(question)).toBeVisible()
  await expect(page.getByText('Open').first()).toBeVisible()
})
