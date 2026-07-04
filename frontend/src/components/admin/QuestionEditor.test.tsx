// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { screen } from '@testing-library/react'
import { renderWithProviders } from '@/test/render'

const { listCategories, listTags } = vi.hoisted(() => ({ listCategories: vi.fn(), listTags: vi.fn() }))
vi.mock('@/lib/api/admin/taxonomy', () => ({
  adminCategoriesAPI: { list: listCategories },
  adminTagsAPI: { list: listTags },
}))
vi.mock('@/lib/api/admin/questions', () => ({
  adminQuestionsAPI: {
    get: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    reviews: vi.fn(),
    submit: vi.fn(),
    approve: vi.fn(),
    reject: vi.fn(),
    newVersion: vi.fn(),
  },
}))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }))

import { QuestionEditor } from './QuestionEditor'

describe('QuestionEditor', () => {
  it('renders the authoring form + live preview in create mode', async () => {
    listCategories.mockResolvedValue([
      { id: 'c1', module: 'math', name: 'Algebra', slug: 'algebra', parent: null, sortOrder: 0 },
    ])
    listTags.mockResolvedValue([])
    renderWithProviders(<QuestionEditor mode="create" />)
    expect(await screen.findByText('Preview')).toBeTruthy()
    expect(screen.getByText(/Start typing to see a live preview/i)).toBeTruthy()
  })
})
