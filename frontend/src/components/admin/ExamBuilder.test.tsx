// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen } from '@testing-library/react'
import { renderWithProviders } from '@/test/render'

const { getExam, listQuestions } = vi.hoisted(() => ({ getExam: vi.fn(), listQuestions: vi.fn() }))
vi.mock('@/lib/api/admin/exams', () => ({
  adminExamsAPI: {
    get: getExam,
    createSection: vi.fn(),
    removeSection: vi.fn(),
    addQuestion: vi.fn(),
    reorderQuestions: vi.fn(),
    removeQuestion: vi.fn(),
  },
}))
vi.mock('@/lib/api/admin/questions', () => ({ adminQuestionsAPI: { list: listQuestions } }))

import { ExamBuilder } from './ExamBuilder'

beforeEach(() => {
  getExam.mockReset()
  listQuestions.mockReset()
})

describe('ExamBuilder', () => {
  it('renders the exam header, sections, and section questions', async () => {
    getExam.mockResolvedValue({
      id: 'e1',
      type: 'practice',
      title: 'SAT Practice 1',
      description: null,
      module: 'full',
      timeLimit: 64,
      isAdaptive: false,
      accessLevel: 'academy',
      createdBy: { id: 'u1', fullName: 'Admin', email: 'a@d' },
      createdAt: '2026-01-01',
      updatedAt: '2026-01-01',
      sections: [
        {
          id: 1,
          sectionNumber: 1,
          title: 'Module 1',
          module: 'math',
          timeLimit: 35,
          sortOrder: 1,
          questions: [
            {
              id: 10,
              position: 1,
              question: { id: 'q1', stem: 'Solve for x', module: 'math', difficulty: 2, answerType: 'mcq', status: 'published' },
            },
          ],
        },
      ],
    })
    renderWithProviders(<ExamBuilder examId="e1" />)
    expect(await screen.findByText('SAT Practice 1')).toBeTruthy()
    expect(screen.getByText(/Section 1/)).toBeTruthy()
    expect(screen.getByText('Solve for x')).toBeTruthy()
  })
})
