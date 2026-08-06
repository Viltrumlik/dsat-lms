// @vitest-environment jsdom
// Domain: Student / Results
// Description: The post-submission answer review — per-question status, the
//   student's answer vs the key, and the per-question detail dialog.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '@/test/render'

const { review } = vi.hoisted(() => ({ review: vi.fn() }))
vi.mock('@/lib/api/sessions', () => ({ sessionAPI: { review } }))

import { AnswerReview } from './AnswerReview'
import type { SessionReviewItem } from '@/types'

function item(partial: Partial<SessionReviewItem> & { number: number }): SessionReviewItem {
  return {
    sectionNumber: 1,
    sectionTitle: 'Math',
    question: {
      id: `q${partial.number}`,
      module: 'math',
      stem: `Stem ${partial.number}`,
      stemImageUrl: null,
      passage: null,
      passageImageUrl: null,
      answerType: 'mcq',
      hasMath: false,
      choices: [
        { label: 'A', text: 'alpha', imageUrl: null, sortOrder: 1 },
        { label: 'B', text: 'beta', imageUrl: null, sortOrder: 2 },
      ],
    },
    correctAnswer: 'A',
    chosenAnswer: 'A',
    status: 'correct',
    ...partial,
  }
}

beforeEach(() => {
  review.mockReset()
})

describe('AnswerReview', () => {
  it('lists every question with its status and both answers', async () => {
    review.mockResolvedValue([
      item({ number: 1, status: 'correct', chosenAnswer: 'A', correctAnswer: 'A' }),
      item({ number: 2, status: 'incorrect', chosenAnswer: 'B', correctAnswer: 'A' }),
      item({ number: 3, status: 'skipped', chosenAnswer: null, correctAnswer: 'B' }),
    ])
    renderWithProviders(<AnswerReview sessionId="s1" />)

    await waitFor(() => expect(screen.getByText('Stem 1')).toBeTruthy())
    expect(screen.getByText('Stem 2')).toBeTruthy()
    expect(screen.getByText('Stem 3')).toBeTruthy()

    // One status icon per row, labelled by outcome.
    expect(screen.getByLabelText('Correct')).toBeTruthy()
    expect(screen.getByLabelText('Incorrect')).toBeTruthy()
    expect(screen.getByLabelText('Not answered')).toBeTruthy()
    // A skipped question shows an em dash instead of an answer.
    expect(screen.getAllByText('—').length).toBeGreaterThan(0)
  })

  it('opens a per-question dialog marking the key and the student choice', async () => {
    const user = userEvent.setup()
    review.mockResolvedValue([
      item({
        number: 1,
        status: 'incorrect',
        chosenAnswer: 'B',
        correctAnswer: 'A',
      }),
    ])
    renderWithProviders(<AnswerReview sessionId="s1" />)

    await waitFor(() => expect(screen.getByText('Stem 1')).toBeTruthy())
    await user.click(screen.getByText('Stem 1'))

    const dialog = await screen.findByRole('dialog')
    expect(dialog.textContent).toContain('Question 1')
    expect(dialog.textContent).toContain('alpha')
    expect(dialog.textContent).toContain('beta')
    // The review is right-and-wrong only — no explanation is served or shown.
    expect(dialog.textContent).not.toContain('Explanation')
    // Both the key and the student's pick are called out inside the dialog.
    expect(screen.getAllByText('Correct answer').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Your answer').length).toBeGreaterThan(0)
  })

  it('renders nothing when the session has no reviewable questions', async () => {
    review.mockResolvedValue([])
    renderWithProviders(<AnswerReview sessionId="s1" />)
    // The card (and its heading) never appears — not even an empty shell.
    await waitFor(() => expect(review).toHaveBeenCalled())
    expect(screen.queryByText('Answer review')).toBeNull()
  })
})
