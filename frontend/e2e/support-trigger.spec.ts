// Domain: E2E
// Description: Phase 4 Support Center S4 — the proactive trigger. seed_demo_academy
//   gives the student a weak topic and runs the sweep, so the dashboard shows a
//   recommendation banner whose "Book help" deep-links into the booking wizard.
//
// Prerequisites (the webServer in playwright.config.ts only starts the frontend):
//   1. Backend running:  cd backend && source .venv/bin/activate && python manage.py runserver
//   2. Academy seeded:   python manage.py seed_demo_academy   (seeds a recommendation)

import { test, expect, type Page } from '@playwright/test'

async function login(page: Page, email: string, password: string) {
  await page.goto('/login')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password', { exact: true }).fill(password)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page).toHaveURL(/\/dashboard/)
}

test('a proactive recommendation deep-links into booking', async ({ page }) => {
  await login(page, 'student@dsat.local', 'DevStudent123!')

  // The dashboard shows a proactive recommendation banner.
  const bookHelp = page.getByRole('link', { name: 'Book help' }).first()
  await expect(bookHelp).toBeVisible()
  await bookHelp.click()

  // It deep-links into the booking wizard, carrying the recommendation id.
  await expect(page).toHaveURL(/\/support\/book\?.*rec=/)
})
