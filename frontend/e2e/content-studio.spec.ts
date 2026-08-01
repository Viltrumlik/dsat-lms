// Domain: E2E
// Description: Admin content studio — questions are NOT versioned, so an admin
//   edits a published question in place and the change is live at once.
//
// Prerequisites (webServer starts the frontend; backend must be running + seeded):
//   python manage.py seed_demo_admin && seed_demo_exam   (admin@dsat.local / DevAdmin123!)

import { test, expect, type Page } from '@playwright/test'

async function login(page: Page, email: string, password: string) {
  await page.goto('/login')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password', { exact: true }).fill(password)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page).toHaveURL(/\/dashboard/)
  // Client-side nav from here on: a full page load would re-restore the session
  // and race the role guard.
}

/** Open the first PUBLISHED question in the studio (the list mixes statuses). */
async function openFirstPublishedQuestion(page: Page) {
  await page.getByRole('link', { name: 'Admin panel' }).click()
  await expect(page).toHaveURL(/\/admin\/users/)
  await page.getByRole('link', { name: 'Questions', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Questions' })).toBeVisible()

  await page.getByLabel('Status').click()
  await page.getByRole('option', { name: 'Published', exact: true }).click()
  await expect(page.locator('table tbody tr').first()).toBeVisible()

  await page.locator('table tbody tr').first().locator('a').first().click()
}

test('admin edits a published question in place — no versioning', async ({ page }) => {
  await login(page, 'admin@dsat.local', 'DevAdmin123!')
  await openFirstPublishedQuestion(page)

  // A published question is editable, with the live-edit warning — and there is
  // no "New version" action to fall back on.
  await expect(page.getByText(/Saving updates it immediately everywhere/i)).toBeVisible()
  await expect(page.getByRole('button', { name: 'New version' })).toHaveCount(0)

  const stem = page.getByLabel('Question')
  await expect(stem).toBeEnabled()
  const original = await stem.inputValue()
  const edited = `${original} [e2e]`

  await stem.fill(edited)
  await page.getByRole('button', { name: 'Save', exact: true }).click()

  // The edit lands on the same question, which stays published (no clone).
  await page.reload()
  await expect(page.getByText(/Saving updates it immediately everywhere/i)).toBeVisible()
  await expect(page.getByLabel('Question')).toHaveValue(edited)

  // Put it back so re-runs stay idempotent.
  await page.getByLabel('Question').fill(original)
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await page.reload()
  await expect(page.getByLabel('Question')).toHaveValue(original)
})
