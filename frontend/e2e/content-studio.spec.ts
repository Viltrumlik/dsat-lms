// Domain: E2E
// Description: Phase 3B admin content studio — an admin opens a published question,
//   creates a new version (§9), then drives it draft → review → published.
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

test('admin versions and re-publishes a question', async ({ page }) => {
  await login(page, 'admin@dsat.local', 'DevAdmin123!')

  await page.getByRole('link', { name: 'Admin panel' }).click()
  await expect(page).toHaveURL(/\/admin\/users/)
  await page.getByRole('link', { name: 'Questions', exact: true }).click()
  await expect(page).toHaveURL(/\/admin\/questions/)
  await expect(page.getByRole('heading', { name: 'Questions' })).toBeVisible()

  // Open the first (seeded, published) question → read-only editor.
  await page.locator('table tbody tr').first().locator('a').first().click()
  await expect(page.getByText('Published questions are read-only')).toBeVisible()

  // Create a new version → editable draft (v2).
  await page.getByRole('button', { name: 'New version' }).click()
  await expect(page.getByText('Draft', { exact: true })).toBeVisible()

  // Draft → review → published.
  await page.getByRole('button', { name: 'Submit for review' }).click()
  await expect(page.getByRole('button', { name: 'Approve' })).toBeVisible()
  await page.getByRole('button', { name: 'Approve' }).click()
  await expect(page.getByText('Published questions are read-only')).toBeVisible()
})
