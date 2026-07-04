// Domain: E2E
// Description: Phase 3A admin happy path against the live backend — an admin signs
//   in, opens the admin panel, creates a user, changes their role, then soft-deletes
//   them (cleanup). Exercises the (admin) route group, the create dialog, the row
//   action menu, the role dialog, and the delete confirm dialog.
//
// Prerequisites (the webServer in playwright.config.ts only starts the frontend):
//   1. Backend running:  cd backend && source .venv/bin/activate && python manage.py runserver
//   2. Admin seeded:     python manage.py seed_demo_admin   (admin@dsat.local / DevAdmin123!)

import { test, expect, type Page } from '@playwright/test'

async function login(page: Page, email: string, password: string) {
  await page.goto('/login')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password', { exact: true }).fill(password)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page).toHaveURL(/\/dashboard/)
}

test('admin creates a user, changes their role, then deletes them', async ({ page }) => {
  await login(page, 'admin@dsat.local', 'DevAdmin123!')

  // Admin panel entry (sidebar) → users table.
  await page.getByRole('link', { name: 'Admin panel' }).click()
  await expect(page).toHaveURL(/\/admin\/users/)
  await expect(page.getByRole('heading', { name: 'Users' })).toBeVisible()
  // A seeded academy user is present.
  await expect(page.getByRole('cell', { name: /teacher@dsat\.local/ })).toBeVisible()

  // Create a new user through the dialog.
  const email = `admin.e2e.${Date.now()}@dsat.local`
  await page.getByRole('button', { name: 'New user' }).click()
  const createDialog = page.getByRole('dialog')
  await createDialog.getByLabel('First name').fill('E2E')
  await createDialog.getByLabel('Last name').fill('Created')
  await createDialog.getByLabel('Email', { exact: true }).fill(email)
  await createDialog.getByLabel('Password').fill('E2ePassword123!')
  await createDialog.getByRole('button', { name: 'Create user' }).click()
  await expect(createDialog).toBeHidden()

  const row = page.getByRole('row', { name: new RegExp(email) })
  await expect(row).toBeVisible()

  // Change role → Teacher via the row action menu + role dialog.
  await row.getByRole('button', { name: 'Actions' }).click()
  await page.getByRole('menuitem', { name: 'Change role' }).click()
  const roleDialog = page.getByRole('dialog')
  await roleDialog.getByRole('combobox').click()
  await page.getByRole('option', { name: 'Teacher' }).click()
  await roleDialog.getByRole('button', { name: 'Save changes' }).click()
  await expect(roleDialog).toBeHidden()
  await expect(row.getByText('Teacher', { exact: true })).toBeVisible()

  // Soft-delete (cleanup) via the row action menu + confirm dialog.
  await row.getByRole('button', { name: 'Actions' }).click()
  await page.getByRole('menuitem', { name: 'Delete' }).click()
  const confirmDialog = page.getByRole('dialog')
  await confirmDialog.getByRole('button', { name: 'Delete' }).click()
  await expect(confirmDialog).toBeHidden()
  await expect(page.getByRole('row', { name: new RegExp(email) })).toBeHidden()
})
