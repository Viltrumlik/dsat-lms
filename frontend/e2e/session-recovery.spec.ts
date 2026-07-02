// Domain: E2E
// Description: Session recovery — the hardest Phase 1 guarantee. Start a test,
//   answer Q1, then reload mid-test and confirm the session and the answer are
//   restored (localStorage hydrate + `GET /sessions/:id` server-wins sync), then
//   finish and submit normally.
//
// Prerequisites (the webServer in playwright.config.ts only starts the frontend):
//   1. Backend running:  cd backend && source .venv/bin/activate && python manage.py runserver
//   2. Demo exam seeded:  python manage.py seed_demo_exam

import { test, expect, type Page } from '@playwright/test'

function uniqueEmail() {
  return `e2e.recovery.${Date.now()}.${Math.floor(Math.random() * 1e6)}@dsat.local`
}

async function register(page: Page, email: string) {
  await page.goto('/register')
  await page.getByLabel('First name').fill('E2E')
  await page.getByLabel('Last name').fill('Recovery')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password', { exact: true }).fill('E2ePassw0rd!')
  await page.getByLabel('Confirm password').fill('E2ePassw0rd!')
  await page.getByRole('button', { name: 'Create account' }).click()
}

// Answer whatever is on screen until the Review screen, advancing section breaks.
async function answerUntilReview(page: Page) {
  const reviewHeading = page.getByRole('heading', { name: /Review your answers/i })
  const sectionComplete = page.getByText(/Section complete/i)
  const gridIn = page.locator('#grid-in')
  for (let i = 0; i < 40; i++) {
    await expect(
      page.getByText(/Question \d+ of \d+/).or(sectionComplete).or(reviewHeading).first()
    ).toBeVisible()
    if (await reviewHeading.isVisible()) return
    if (await sectionComplete.isVisible()) {
      await page.getByRole('button', { name: /Begin next section/i }).click()
      await expect(sectionComplete).toBeHidden()
      continue
    }
    if (await gridIn.isVisible()) {
      await gridIn.fill('36')
    } else {
      await page.getByRole('radio').first().click()
    }
    await page.getByRole('button', { name: 'Next question' }).click()
  }
  throw new Error('Did not reach the Review screen within the step budget.')
}

test('a mid-test reload restores the session and the answer', async ({ page }) => {
  await register(page, uniqueEmail())
  await expect(page).toHaveURL(/\/verify-email/)
  await page.getByRole('link', { name: /Continue to dashboard/i }).click()
  await expect(page).toHaveURL(/\/dashboard/)

  await page.getByRole('button', { name: /Start test/i }).first().click()
  await expect(page).toHaveURL(/\/session\//)
  await expect(page.getByText(/Question 1 of/)).toBeVisible()
  const sessionUrl = page.url()

  // Answer Q1 (first choice) and wait for the server to persist it, so recovery
  // has the answer from BOTH localStorage and the server (server-wins can't clobber).
  const answerSaved = page.waitForResponse(
    (r) => r.url().includes('/answer/') && r.request().method() === 'POST' && r.ok()
  )
  await page.getByRole('radio').first().click()
  await answerSaved
  await expect(page.getByRole('radio', { checked: true })).toHaveCount(1)

  // Reload mid-test — this is the crash/refresh recovery path.
  await page.reload()

  // Same session, same question, and the answer is restored (not reset).
  await expect(page).toHaveURL(sessionUrl)
  await expect(page.getByText(/Question 1 of/)).toBeVisible()
  await expect(page.getByRole('radio', { checked: true })).toHaveCount(1)

  // The recovered session still completes normally.
  await answerUntilReview(page)
  await page.getByRole('button', { name: 'Submit test' }).first().click()
  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()
  await dialog.getByRole('button', { name: 'Submit test' }).click()

  await expect(page).toHaveURL(/\/results\//)
  await expect(page.getByText(/out of 1600/i)).toBeVisible()
})
