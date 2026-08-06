// Domain: E2E
// Description: The question authoring workspace — the bank list and the editor
//   side by side, the formula toolbar, and in-place editing of a published
//   question (questions are not versioned, so a save is live everywhere).
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

async function openQuestions(page: Page) {
  await page.getByRole('link', { name: 'Admin panel' }).click()
  await expect(page).toHaveURL(/\/admin\/users/)
  await page.getByRole('link', { name: 'Questions', exact: true }).click()
  await expect(page).toHaveURL(/\/admin\/questions/)
  await expect(page.getByRole('heading', { name: 'Questions' })).toBeVisible()
}

/** The bank rows are buttons carrying a status badge and the stem. */
function questionRows(page: Page) {
  return page.locator('button[aria-current]')
}

test('the bank and the editor sit side by side — selecting never leaves the page', async ({
  page,
}) => {
  await login(page, 'admin@dsat.local', 'DevAdmin123!')
  await openQuestions(page)

  // Empty state until something is picked.
  await expect(page.getByText('No question selected')).toBeVisible()

  await questionRows(page).first().click()
  await expect(page.getByText('Editing question')).toBeVisible()
  // The bank is still on screen — this is a panel, not a page change.
  await expect(page.getByPlaceholder(/Search/i)).toBeVisible()
  // The live student-view preview renders beside the form.
  await expect(page.getByRole('main').getByText('Student view')).toBeVisible()
})

test('the formula toolbar inserts at the cursor of the focused field', async ({ page }) => {
  await login(page, 'admin@dsat.local', 'DevAdmin123!')
  await openQuestions(page)
  await page.getByRole('button', { name: 'New question' }).first().click()

  const stem = page.getByLabel('Question', { exact: true })
  await stem.click()
  await stem.fill('Solve ')
  await page.getByRole('button', { name: 'Square root' }).click()

  await expect(stem).toHaveValue('Solve \\sqrt{}')

  // The checklist tells the author what is still missing.
  await expect(page.getByText(/left before this can be published/i)).toBeVisible()
})

test('a published question is editable in place — no versioning', async ({ page }) => {
  await login(page, 'admin@dsat.local', 'DevAdmin123!')
  await openQuestions(page)

  await page.getByLabel('Status').click()
  await page.getByRole('option', { name: 'Published', exact: true }).click()
  // Wait for the filtered list to land — clicking during the refetch can select
  // a row that the incoming page then replaces.
  await expect(questionRows(page).first()).toContainText('Published')
  await expect(questionRows(page).filter({ hasText: 'Draft' })).toHaveCount(0)
  await questionRows(page).first().click()
  await expect(page.getByText('Editing question')).toBeVisible()

  // Editable, with the live-edit warning — and no "New version" escape hatch.
  await expect(page.getByText(/Saving updates it immediately everywhere/i)).toBeVisible()
  await expect(page.getByRole('button', { name: 'New version' })).toHaveCount(0)

  const stem = page.getByLabel('Question', { exact: true })
  await expect(stem).toBeEditable()

  // Editing marks the draft dirty; saving PATCHes the SAME question with the new
  // text — an in-place update, not a clone.
  const original = await stem.inputValue()
  await stem.fill(`${original} [e2e]`)
  await expect(page.getByText('Unsaved changes')).toBeVisible()

  const patched = page.waitForRequest(
    (r) => r.url().includes('/admin/questions/') && r.method() === 'PATCH'
  )
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  const request = await patched
  expect(request.postDataJSON()?.stem).toBe(`${original} [e2e]`)
  await expect(page.getByText('All changes saved')).toBeVisible()

  // Restore so re-runs start from the same content.
  await stem.fill(original)
  const restored = page.waitForRequest(
    (r) => r.url().includes('/admin/questions/') && r.method() === 'PATCH'
  )
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await restored
})
