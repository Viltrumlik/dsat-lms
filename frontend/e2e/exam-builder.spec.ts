// Domain: E2E
// Description: Phase 3C admin exam builder + assignments — an admin opens a seeded
//   exam's builder (sections + questions) and the assignment dialog.
//
// Prerequisites: backend running + seeded (seed_demo_admin, seed_demo_exam, seed_demo_academy).

import { test, expect, type Page } from '@playwright/test'

async function login(page: Page, email: string, password: string) {
  await page.goto('/login')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password', { exact: true }).fill(password)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page).toHaveURL(/\/dashboard/)
}

test('admin opens the exam builder and the assign dialog', async ({ page }) => {
  await login(page, 'admin@dsat.local', 'DevAdmin123!')

  await page.getByRole('link', { name: 'Admin panel' }).click()
  await expect(page).toHaveURL(/\/admin\/users/)

  // Exams → builder for the seeded exam.
  await page.getByRole('link', { name: 'Exams', exact: true }).click()
  await expect(page).toHaveURL(/\/admin\/exams/)
  await expect(page.getByRole('heading', { name: 'Exams' })).toBeVisible()
  await page.locator('table tbody tr').first().locator('a').first().click()
  await expect(page.getByText(/Section 1/).first()).toBeVisible()
  await expect(page.getByRole('button', { name: 'Add section' })).toBeVisible()

  // Assignments → assign dialog with its fields.
  await page.getByRole('link', { name: 'Assignments', exact: true }).click()
  await expect(page).toHaveURL(/\/admin\/assignments/)
  await page.getByRole('button', { name: 'Assign exam' }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog.getByRole('heading', { name: 'Assign an exam' })).toBeVisible()
  await expect(dialog.getByLabel('Max attempts')).toBeVisible()
  await expect(dialog.getByLabel('Opens')).toBeVisible()
})
