// Domain: E2E
// Description: The Bluebook exam surface — the chrome every test system shares.
//   Covers the exam-type banner, Directions sheet, answer eliminator, the
//   highlight + note annotation flow (including its survival across a reload),
//   and the question navigator popover.
//
// Prerequisites (the webServer in playwright.config.ts only starts the frontend):
//   1. Backend running:  cd backend && source .venv/bin/activate && python manage.py runserver
//   2. Demo exam seeded:  python manage.py seed_demo_exam

import { test, expect, type Page } from '@playwright/test'

function uniqueEmail() {
  return `e2e.surface.${Date.now()}.${Math.floor(Math.random() * 1e6)}@dsat.local`
}

async function registerAndStartTest(page: Page) {
  await page.goto('/register')
  await page.getByLabel('First name').fill('E2E')
  await page.getByLabel('Last name').fill('Surface')
  await page.getByLabel('Email').fill(uniqueEmail())
  await page.getByLabel('Password', { exact: true }).fill('E2ePassw0rd!')
  await page.getByLabel('Confirm password').fill('E2ePassw0rd!')
  await page.getByRole('button', { name: 'Create account' }).click()

  await page.getByRole('link', { name: /Continue to dashboard/i }).click()
  await expect(page).toHaveURL(/\/dashboard/)
  await page.getByRole('button', { name: /Start test/i }).first().click()
  await expect(page).toHaveURL(/\/session\//)
  await expect(page.getByText(/Question 1 of/)).toBeVisible()
}

/** Selects `text` inside the passage pane and releases, opening the toolbar. */
async function selectInPassage(page: Page, text: string) {
  await page.evaluate((needle) => {
    const pane = document.querySelector('.bb-selectable')
    if (!pane) throw new Error('no annotatable pane')
    const walker = document.createTreeWalker(pane, NodeFilter.SHOW_TEXT)
    let node = walker.nextNode() as Text | null
    while (node) {
      const at = node.data.indexOf(needle)
      if (at !== -1) {
        const range = document.createRange()
        range.setStart(node, at)
        range.setEnd(node, at + needle.length)
        const sel = window.getSelection()!
        sel.removeAllRanges()
        sel.addRange(range)
        const rect = range.getBoundingClientRect()
        pane.dispatchEvent(
          new MouseEvent('mouseup', { bubbles: true, clientX: rect.left, clientY: rect.top })
        )
        return
      }
      node = walker.nextNode() as Text | null
    }
    throw new Error(`"${needle}" not found in the passage`)
  }, text)
}

test('the exam surface exposes the banner, directions, and eliminator', async ({ page }) => {
  await registerAndStartTest(page)

  // The navy banner names the exam type — every system renders one.
  await expect(page.getByText(/This is a practice test/i)).toBeVisible()

  // Directions open into a sheet and close via the yellow Close button.
  await page.getByRole('button', { name: 'Directions' }).click()
  const directions = page.getByRole('dialog', { name: 'Directions' })
  await expect(directions).toBeVisible()
  await expect(directions.getByText(/multiple choice with four answer choices/i)).toBeVisible()
  await directions.getByRole('button', { name: 'Close' }).click()
  await expect(directions).toBeHidden()

  // The eliminator column is hidden until ABC mode is switched on.
  const eliminateA = page.getByRole('button', { name: 'Cross out choice A' })
  await expect(eliminateA).toBeHidden()
  await page.getByRole('button', { name: 'Toggle answer eliminator' }).click()
  await expect(eliminateA).toBeVisible()

  // Crossing out A then picking it restores the choice and selects it.
  await eliminateA.click()
  await expect(page.getByRole('button', { name: 'Restore choice A' })).toBeVisible()
  await page.getByRole('radio').first().click()
  await expect(page.getByRole('radio', { checked: true })).toHaveCount(1)
  await expect(eliminateA).toBeVisible()
})

test('a highlight and its note survive a mid-test reload', async ({ page }) => {
  await registerAndStartTest(page)
  const sessionUrl = page.url()

  await selectInPassage(page, 'committee')
  const toolbar = page.getByRole('toolbar', { name: /Highlight options/i })
  await expect(toolbar).toBeVisible()

  // Highlighting then adding a note opens the notes rail focused on the card.
  await toolbar.getByRole('button', { name: 'Highlight yellow' }).click()
  await toolbar.getByRole('button', { name: 'Add note' }).click()

  const note = page.getByPlaceholder('Notes are saved automatically.')
  await expect(note).toBeVisible()
  await note.fill('subject-verb agreement')

  await page.getByRole('radio').first().click()

  // Flush the annotation to the server without waiting out the 30s autosave
  // tick: hiding the tab runs the same save path the engine uses on unload.
  const saved = page.waitForResponse(
    (r) => r.url().includes('/sessions/') && r.request().method() === 'PATCH' && r.ok()
  )
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', {
      value: 'hidden',
      configurable: true,
    })
    document.dispatchEvent(new Event('visibilitychange'))
  })
  await saved

  await page.reload()
  await expect(page).toHaveURL(sessionUrl)

  // Highlight, note text, and the answer all come back.
  await expect(page.locator('mark.bb-hl')).toHaveText('committee')
  await expect(page.getByPlaceholder('Notes are saved automatically.')).toHaveValue(
    'subject-verb agreement'
  )
  await expect(page.getByRole('radio', { checked: true })).toHaveCount(1)
})

test('the navigator popover reflects answered and marked questions', async ({ page }) => {
  await registerAndStartTest(page)

  await page.getByRole('radio').first().click()
  await page.getByRole('button', { name: /Mark for Review/i }).click()

  await page.getByRole('button', { name: /Question 1 of/ }).click()
  const popover = page.getByRole('button', { name: 'Go to question 2' })
  await expect(popover).toBeVisible()
  // The popover's legend (distinct from the header's "Mark for Review" control).
  await expect(page.getByText('For Review', { exact: true })).toBeVisible()

  // Jumping from the grid moves the engine and closes the popover.
  await popover.click()
  await expect(page.getByText(/Question 2 of/)).toBeVisible()
  await expect(page.getByRole('button', { name: 'Go to question 2' })).toBeHidden()
})
