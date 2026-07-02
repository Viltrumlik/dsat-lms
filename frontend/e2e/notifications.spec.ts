// Domain: E2E
// Description: Phase 2G notifications + homework auto-submit happy path —
//   a teacher-assigned homework produces a localized bell notification; the
//   notifications page filters unread and marks all read; starting the linked
//   test from the homework and submitting it turns the homework in automatically.
//
// Prerequisites (the webServer in playwright.config.ts only starts the frontend):
//   1. Backend running:  cd backend && source .venv/bin/activate && python manage.py runserver
//   2. Academy seeded:   python manage.py seed_demo_academy   (after seed_demo_exam)

import { test, expect, request, type Page } from '@playwright/test'

const API_URL = (process.env.E2E_API_URL ?? 'http://localhost:8000') + '/api/v1'

async function apiToken(email: string, password: string): Promise<string> {
  const api = await request.newContext()
  const res = await api.post(`${API_URL}/auth/login/`, { data: { email, password } })
  expect(res.ok(), `login as ${email} (did you run seed_demo_academy?)`).toBeTruthy()
  const body = await res.json()
  await api.dispose()
  return body.data.access_token
}

async function login(page: Page, email: string, password: string) {
  await page.goto('/login')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password', { exact: true }).fill(password)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page).toHaveURL(/\/dashboard/)
}

test('homework notification deep-links and the linked test auto-submits the homework', async ({
  page,
}) => {
  // Teacher: assign a fresh exam-backed homework (fires homework_assigned).
  const teacherToken = await apiToken('teacher@dsat.local', 'DevTeacher123!')
  const api = await request.newContext()
  const teacherAuth = { Authorization: `Bearer ${teacherToken}` }
  const classes = (await (await api.get(`${API_URL}/teacher/classes/`, { headers: teacherAuth })).json())
    .data
  const klass = classes.find((c: { name: string }) => c.name === 'SAT Morning Group')
  const exams = (await (await api.get(`${API_URL}/exams/`, { headers: teacherAuth })).json()).data
  expect(exams.length, 'a startable exam exists (seed_demo_exam)').toBeGreaterThan(0)

  const title = `E2E notify homework ${Date.now()}`
  const created = await api.post(`${API_URL}/homework/`, {
    headers: teacherAuth,
    data: {
      title,
      assigned_class: klass.id,
      exam: exams[0].id,
      due_at: new Date(Date.now() + 2 * 86_400_000).toISOString(),
    },
  })
  expect(created.status()).toBe(201)
  const homeworkId = (await created.json()).data.id
  await api.dispose()

  // Student: the bell shows unread; the dropdown renders the localized template.
  await login(page, 'student@dsat.local', 'DevStudent123!')
  const bell = page.getByRole('button', { name: /Notifications/ })
  await expect(bell).toHaveAccessibleName(/unread/)
  await bell.click()
  const menu = page.getByRole('menu')
  await expect(menu.getByText(`New homework: ${title}`)).toBeVisible()

  // Full page: unread filter shows the row; clicking deep-links to the homework.
  await menu.getByRole('menuitem', { name: 'View all' }).click()
  await expect(page).toHaveURL(/\/notifications/)
  await page.getByRole('button', { name: 'Unread', exact: true }).click()
  const row = page.getByRole('link', { name: new RegExp(`New homework: ${title}`) })
  await expect(row).toBeVisible()
  await row.click()
  await expect(page).toHaveURL(new RegExp(`/homework/${homeworkId}`))

  // Start the linked test from the homework and finish it — the homework is
  // turned in automatically (no manual submit).
  await page.getByRole('button', { name: 'Start test' }).click()
  await expect(page).toHaveURL(/\/session\//)
  await expect(page.getByText(/Question 1 of/)).toBeVisible()

  const reviewHeading = page.getByRole('heading', { name: /Review your answers/i })
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
  await page.getByRole('dialog').getByRole('button', { name: 'Submit test' }).click()
  await expect(page).toHaveURL(/\/results\//)

  // Back on the homework: status is Submitted with no action buttons.
  await page.goto(`/homework/${homeworkId}`)
  await expect(page.getByText('Submitted', { exact: true }).first()).toBeVisible()
  await expect(page.getByRole('button', { name: 'Submit homework' })).toHaveCount(0)

  // Mark all read → badge clears.
  await page.goto('/notifications')
  await page.getByRole('button', { name: 'Mark all read' }).click()
  await expect(page.getByRole('button', { name: /Notifications/ })).toHaveAccessibleName(
    'Notifications'
  )
})
