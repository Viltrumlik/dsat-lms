// @vitest-environment jsdom
// Domain: Admin (content studio)
// Description: The authoring workspace — the bank list, selecting a question
//   into the editor beside it, and the formula toolbar inserting at the caret.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '@/test/render'

const { list, get } = vi.hoisted(() => ({ list: vi.fn(), get: vi.fn() }))
vi.mock('@/lib/api/admin/questions', () => ({
  adminQuestionsAPI: {
    list,
    get,
    create: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
    submit: vi.fn(),
    approve: vi.fn(),
    reject: vi.fn(),
    reviews: vi.fn().mockResolvedValue([]),
  },
}))
vi.mock('@/lib/api/admin/taxonomy', () => ({
  adminCategoriesAPI: { list: vi.fn().mockResolvedValue([{ id: 'c1', name: 'Algebra', slug: 'algebra' }]) },
  adminTagsAPI: { list: vi.fn().mockResolvedValue([]) },
}))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
}))

import { QuestionsPanel } from './QuestionsPanel'

const LIST_ITEM = {
  id: 'q1',
  module: 'math',
  category: { id: 'c1', name: 'Algebra', slug: 'algebra' },
  difficulty: 3,
  answerType: 'mcq',
  hasMath: true,
  status: 'published',
  stem: 'Which choice best completes the text?',
  tags: [],
  createdAt: '',
  updatedAt: '',
}

const DETAIL = {
  ...LIST_ITEM,
  stemImageUrl: null,
  passage: null,
  passageImageUrl: null,
  choices: [
    { label: 'A', text: '2', imageUrl: null, sortOrder: 0 },
    { label: 'B', text: '3', imageUrl: null, sortOrder: 1 },
  ],
  correctAnswer: 'B',
  explanation: null,
  explanationImageUrl: null,
  source: 'custom',
  sourceRef: null,
  createdBy: { id: 'u1', fullName: 'Admin', email: 'a@x' },
  reviewedBy: null,
  publishedAt: null,
}

beforeEach(() => {
  list.mockReset().mockResolvedValue({ data: [LIST_ITEM], pagination: { count: 1, next: null, previous: null } })
  get.mockReset().mockResolvedValue(DETAIL)
})

describe('QuestionsPanel', () => {
  it('lists the bank beside an empty-state editor', async () => {
    renderWithProviders(<QuestionsPanel />)
    expect(await screen.findByText(/Which choice best completes/)).toBeTruthy()
    expect(screen.getByText('No question selected')).toBeTruthy()
  })

  it('opens a question in the editor without leaving the page', async () => {
    const user = userEvent.setup()
    renderWithProviders(<QuestionsPanel />)

    await user.click(await screen.findByText(/Which choice best completes/))

    // The editor pane loads the detail and seeds the fields.
    await waitFor(() => expect(get).toHaveBeenCalledWith('q1'))
    expect(await screen.findByText('Editing question')).toBeTruthy()
    // The published warning tells the author the edit is live.
    expect(screen.getByText(/Saving updates it immediately everywhere/i)).toBeTruthy()
    // The list is still there — this is a panel, not a page change.
    expect(screen.getByPlaceholderText(/Search/i)).toBeTruthy()
  })

  it('starts a blank draft and shows what is still missing', async () => {
    renderWithProviders(<QuestionsPanel initialCreating />)

    expect(await screen.findAllByText('New question')).not.toHaveLength(0)
    // Nothing is filled in, so the checklist blocks publishing.
    expect(screen.getByText(/left before this can be published/i)).toBeTruthy()
    expect(screen.getByText('Question text written')).toBeTruthy()
    expect(screen.getByText('Correct answer marked')).toBeTruthy()
  })

  it('inserts a formula snippet at the caret of the focused field', async () => {
    const user = userEvent.setup()
    renderWithProviders(<QuestionsPanel initialCreating />)

    const stem = (await screen.findByLabelText('Question', { exact: true })) as HTMLTextAreaElement
    await user.click(stem)
    await user.type(stem, 'Solve ')

    await user.click(screen.getByRole('button', { name: 'Square root' }))

    await waitFor(() => expect(stem.value).toBe('Solve \\sqrt{}'))
  })

  it('only lets the key point at a choice that has text', async () => {
    const user = userEvent.setup()
    renderWithProviders(<QuestionsPanel initialCreating />)

    expect(await screen.findByText('Choices')).toBeTruthy()

    // No choice text yet → every key button is disabled.
    const keyGroup = screen.getByRole('group', { name: 'Correct answer' })
    const before = within(keyGroup).getAllByRole('button')
    expect(before.every((b) => (b as HTMLButtonElement).disabled)).toBe(true)

    await user.type(screen.getByLabelText('Choice A'), 'alpha')

    await waitFor(() => {
      const after = within(keyGroup).getAllByRole('button') as HTMLButtonElement[]
      expect(after[0].disabled).toBe(false)
      expect(after[1].disabled).toBe(true)
    })
  })
})
