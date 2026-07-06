// Domain: E2E
// Description: Phase 4 S7 admin ops dashboard happy path — an admin opens the
//   Support ops dashboard (KPI cards + bookings-by-status + daily trend, all
//   populated by seed_demo_academy's rollup), then rebuilds the rollup on demand.
//
// Prerequisites (the webServer in playwright.config.ts only starts the frontend):
//   1. Backend running:  cd backend && source .venv/bin/activate && python manage.py runserver
//   2. Admin seeded:     python manage.py seed_demo_admin   (admin@dsat.local / DevAdmin123!)
//   3. Academy seeded:   python manage.py seed_demo_academy (bookings/tickets + rollup)

import { test, expect, type Page } from '@playwright/test'

async function login(page: Page, email: string, password: string) {
  await page.goto('/login')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password', { exact: true }).fill(password)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page).toHaveURL(/\/dashboard/)
}

test('admin opens the support ops dashboard and rebuilds the rollup', async ({ page }) => {
  await login(page, 'admin@dsat.local', 'DevAdmin123!')

  await page.goto('/admin/support-ops')
  await expect(page.getByRole('heading', { name: 'Support operations' })).toBeVisible()

  // KPI cards + both charts render.
  await expect(page.getByText('Total bookings')).toBeVisible()
  await expect(page.getByText('Open questions')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Bookings by status' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Daily activity' })).toBeVisible()

  // Rebuild the rollup on demand → success toast.
  await page.getByRole('button', { name: 'Rebuild' }).click()
  await expect(page.getByText('Rollup rebuilt')).toBeVisible()
})
