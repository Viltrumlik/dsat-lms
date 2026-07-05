// Domain: E2E
// Description: Phase 4A teacher dashboard + insights happy path against the live
//   backend — teacher signs in, opens the dashboard (counts + "needs attention"),
//   drills into a class (group stats + per-student risk roster), then opens a
//   student drilldown (risk banner + weakest-topics insight).
//
// Prerequisites (the webServer in playwright.config.ts only starts the frontend):
//   1. Backend running:  cd backend && source .venv/bin/activate && python manage.py runserver
//   2. Academy seeded:   python manage.py seed_demo_academy   (after seed_demo_exam)

import { test, expect, type Page } from '@playwright/test'

async function login(page: Page, email: string, password: string) {
  await page.goto('/login')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password', { exact: true }).fill(password)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page).toHaveURL(/\/dashboard/)
}

const RISK = /At risk|Watch|On track/

test('teacher dashboard surfaces insights and a student drilldown', async ({ page }) => {
  await login(page, 'teacher@dsat.local', 'DevTeacher123!')

  // Student sidebar → Teacher panel now lands on the dashboard.
  await page.getByRole('link', { name: 'Teacher panel' }).click()
  await expect(page).toHaveURL(/\/teacher\/dashboard/)
  await expect(page.getByRole('heading', { name: 'Dashboard', exact: true })).toBeVisible()
  for (const label of ['Classes', 'Active students', 'Pending grading', 'Need attention']) {
    await expect(page.getByText(label, { exact: true }).first()).toBeVisible()
  }
  await expect(page.getByRole('heading', { name: 'Students who need attention' })).toBeVisible()

  // Dedicated, paginated pages (the growing lists live here, not on the dashboard).
  await page.getByRole('link', { name: 'Students', exact: true }).click()
  await expect(page).toHaveURL(/\/teacher\/students$/)
  await expect(page.getByRole('heading', { name: 'Students', exact: true })).toBeVisible()
  await expect(page.getByRole('columnheader', { name: 'Status' })).toBeVisible()
  await expect(page.getByText(RISK).first()).toBeVisible()

  await page.getByRole('link', { name: 'Grading' }).click()
  await expect(page).toHaveURL(/\/teacher\/grading$/)
  await expect(page.getByRole('heading', { name: 'Grading', exact: true })).toBeVisible()

  // Class overview — group stats + a per-student risk roster.
  await page.getByRole('link', { name: 'Classes' }).click()
  await expect(page).toHaveURL(/\/teacher\/classes$/)
  await page.getByRole('link', { name: /SAT Morning Group/ }).first().click()
  await expect(page.getByText('Avg accuracy')).toBeVisible()
  await expect(page.getByRole('columnheader', { name: 'Status' })).toBeVisible()
  await expect(page.getByText(RISK).first()).toBeVisible()

  // Student drilldown — risk banner + insight sections.
  await page.getByRole('link', { name: /Aziza Karimova/ }).click()
  await expect(page).toHaveURL(/\/teacher\/students\//)
  await expect(page.getByText(RISK).first()).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Weakest topics' })).toBeVisible()
})
