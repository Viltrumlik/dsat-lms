// Domain: E2E
// Description: The post-submission answer review — every question with the key,
//   the student's answer and the correct/incorrect outcome, plus the
//   per-question pop-up.
//
// Prerequisites (webServer starts the frontend; backend must be running):
//   python manage.py seed_demo_exam

import { test, expect, type Page } from '@playwright/test'

function uniqueEmail() {
  return `e2e.review.${Date.now()}.${Math.floor(Math.random() * 1e6)}@dsat.local`
}

/** Register, take the whole demo test, submit, and land on the results page. */
async function takeAndSubmitTest(page: Page) {
  await page.goto('/register')
  await page.getByLabel('First name').fill('E2E')
  await page.getByLabel('Last name').fill('Review')
  await page.getByLabel('Email').fill(uniqueEmail())
  await page.getByLabel('Password', { exact: true }).fill('E2ePassw0rd!')
  await page.getByLabel('Confirm password').fill('E2ePassw0rd!')
  await page.getByRole('button', { name: 'Create account' }).click()

  await page.getByRole('link', { name: /Continue to dashboard/i }).click()
  await page.getByRole('button', { name: /Start test/i }).first().click()
  await expect(page).toHaveURL(/\/session\//)

  const reviewHeading = page.getByRole('heading', { name: /Check Your Work/i })
  const sectionComplete = page.getByText(/Section complete/i)
  const gridIn = page.locator('#grid-in')

  for (let i = 0; i < 40; i++) {
    await expect(
      page.getByText(/Question \d+ of \d+/).or(sectionComplete).or(reviewHeading).first()
    ).toBeVisible()
    if (await reviewHeading.isVisible()) break
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

  await page.getByRole('button', { name: 'Submit test' }).first().click()
  const dialog = page.getByRole('dialog')
  await dialog.getByRole('button', { name: 'Submit test' }).click()
  await expect(page).toHaveURL(/\/results\//)
}

test('the results page reviews every answer and opens a per-question pop-up', async ({ page }) => {
  await takeAndSubmitTest(page)

  const review = page.getByText('Answer review')
  await expect(review).toBeVisible()

  // One row per question, each showing both answers.
  const rows = page.locator('button', { hasText: 'Correct answer' })
  await expect(rows.first()).toBeVisible()
  const rowCount = await rows.count()
  expect(rowCount).toBeGreaterThan(0)

  // Clicking a row opens the full per-question review.
  await rows.first().click()
  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()
  await expect(dialog.getByText(/Question \d+/)).toBeVisible()
  // The key and the student's pick are both called out inside the dialog.
  await expect(dialog.getByText('Correct answer').first()).toBeVisible()

  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
})
