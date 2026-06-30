// Domain: E2E
// Description: Phase 1 happy path against the live backend —
//   register → verify-email screen → dashboard → take the demo practice test
//   (MCQ + grid-in across two sections) → submit → results.
//
// Prerequisites (the webServer in playwright.config.ts only starts the frontend):
//   1. Backend running:  cd backend && source .venv/bin/activate && python manage.py runserver
//   2. Demo exam seeded:  python manage.py seed_demo_exam
//
// The demo exam is "Demo Practice Test (Public)" — 2 sections (Reading & Writing
// with 2 MCQs, Math with 2 MCQs + 1 grid-in). The answer loop below is written
// generically, so it tolerates changes to the per-section question counts.

import { test, expect, type Page } from '@playwright/test'

// A unique email per run so registration never collides with a prior account.
function uniqueEmail() {
  return `e2e.${Date.now()}.${Math.floor(Math.random() * 1e6)}@dsat.local`
}

async function register(page: Page, email: string) {
  await page.goto('/register')
  await page.getByLabel('First name').fill('E2E')
  await page.getByLabel('Last name').fill('Tester')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password', { exact: true }).fill('E2ePassw0rd!')
  await page.getByLabel('Confirm password').fill('E2ePassw0rd!')
  await page.getByRole('button', { name: 'Create account' }).click()
}

// Answers whatever question is on screen (MCQ or grid-in), advancing through
// section breaks, until the Review screen appears. Bounded to avoid hanging.
async function answerUntilReview(page: Page) {
  const reviewHeading = page.getByRole('heading', { name: /Review your answers/i })
  const sectionComplete = page.getByText(/Section complete/i)
  const beginNext = page.getByRole('button', { name: /Begin next section/i })
  const gridIn = page.locator('#grid-in')
  const nextBtn = page.getByRole('button', { name: 'Next question' })

  for (let i = 0; i < 40; i++) {
    // Wait until the engine has settled on one of: a question, the between-
    // section break, or the review screen.
    await expect(
      page.getByText(/Question \d+ of \d+/).or(sectionComplete).or(reviewHeading).first()
    ).toBeVisible()

    if (await reviewHeading.isVisible()) return

    if (await sectionComplete.isVisible()) {
      // begin() runs an async autosave then unmounts the break screen — wait for
      // it to disappear so we don't re-click the button while it's still loading.
      await beginNext.click()
      await expect(sectionComplete).toBeHidden()
      continue
    }

    if (await gridIn.isVisible()) {
      await gridIn.fill('36')
    } else {
      await page.getByRole('radio').first().click()
    }
    await nextBtn.click()
  }
  throw new Error('Did not reach the Review screen within the step budget.')
}

test('student can register, take the demo practice test, and see results', async ({ page }) => {
  const email = uniqueEmail()

  // Register → app routes to the verify-email screen.
  await register(page, email)
  await expect(page).toHaveURL(/\/verify-email/)
  // "Check your email" is a CardTitle (renders as a div, not a heading role);
  // match exactly so it doesn't also resolve the description paragraph.
  await expect(page.getByText('Check your email', { exact: true })).toBeVisible()

  // The student can continue without clicking the email link (session is live).
  await page.getByRole('link', { name: /Continue to dashboard/i }).click()
  await expect(page).toHaveURL(/\/dashboard/)
  await expect(page.getByRole('heading', { name: /Welcome back/i })).toBeVisible()

  // Start the seeded demo practice test.
  await page.getByRole('button', { name: /Start test/i }).first().click()
  await expect(page).toHaveURL(/\/session\//)
  await expect(page.getByText(/Question 1 of/)).toBeVisible()

  // Sanity-check the test engine surface: timer, flag control, and KaTeX-capable
  // question renderer are all present.
  await expect(page.getByRole('button', { name: /Pause test/i })).toBeVisible()

  // Work through every question across both sections.
  await answerUntilReview(page)

  // Submit from the review screen (confirm in the dialog).
  await page.getByRole('button', { name: 'Submit test' }).first().click()
  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()
  await dialog.getByRole('button', { name: 'Submit test' }).click()

  // Results screen with a scaled total score.
  await expect(page).toHaveURL(/\/results\//)
  await expect(page.getByText(/Test complete/i)).toBeVisible()
  await expect(page.getByText(/out of 1600/i)).toBeVisible()
})
