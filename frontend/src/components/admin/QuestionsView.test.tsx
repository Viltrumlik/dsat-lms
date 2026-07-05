// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen } from '@testing-library/react'
import { renderWithProviders } from '@/test/render'

const { list } = vi.hoisted(() => ({ list: vi.fn() }))
vi.mock('@/lib/api/admin/questions', () => ({
  adminQuestionsAPI: { list, submit: vi.fn(), newVersion: vi.fn(), remove: vi.fn() },
}))

import { QuestionsView } from './QuestionsView'

function question(over = {}) {
  return {
    id: 'q1',
    module: 'math',
    category: { id: 'c1', name: 'Algebra', module: 'math' },
    difficulty: 3,
    answerType: 'mcq',
    hasMath: false,
    status: 'draft',
    stem: 'What is 2+2?',
    tags: [],
    version: 1,
    parent: null,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...over,
  }
}

beforeEach(() => list.mockReset())

describe('QuestionsView', () => {
  it('renders questions + status from the API', async () => {
    list.mockResolvedValue({ data: [question()], pagination: { count: 1, next: null, previous: null } })
    renderWithProviders(<QuestionsView />)
    expect(await screen.findByText('What is 2+2?')).toBeTruthy()
    expect(screen.getByText('Draft')).toBeTruthy()
    expect(screen.getByText('Algebra')).toBeTruthy()
  })

  it('shows the empty state when there are no questions', async () => {
    list.mockResolvedValue({ data: [], pagination: { count: 0, next: null, previous: null } })
    renderWithProviders(<QuestionsView />)
    expect(await screen.findByText(/No questions match/i)).toBeTruthy()
  })
})
