import { describe, it, expect } from 'vitest'
import { homeworkStatusOf, isOverdue } from './HomeworkStatusBadge'
import type { Homework } from '@/types'

function homework(overrides: Partial<Homework> = {}): Homework {
  return {
    id: 'hw-1',
    title: 'Linear equations drill',
    description: '',
    assignedClass: 'class-1',
    className: 'SAT Morning',
    exam: null,
    examTitle: null,
    dueAt: new Date(Date.now() + 86_400_000).toISOString(), // tomorrow
    isPublished: true,
    mySubmission: null,
    createdAt: new Date().toISOString(),
    ...overrides,
  }
}

describe('homeworkStatusOf', () => {
  it('is assigned when the student has no submission', () => {
    expect(homeworkStatusOf(homework())).toBe('assigned')
  })

  it('mirrors the submission status when one exists', () => {
    expect(
      homeworkStatusOf(
        homework({ mySubmission: { status: 'submitted', submittedAt: '2026-07-01T10:00:00Z' } })
      )
    ).toBe('submitted')
    expect(
      homeworkStatusOf(
        homework({ mySubmission: { status: 'graded', submittedAt: '2026-07-01T10:00:00Z' } })
      )
    ).toBe('graded')
  })
})

describe('isOverdue', () => {
  it('is false before the due date', () => {
    expect(isOverdue(homework())).toBe(false)
  })

  it('is true past due while still unsubmitted', () => {
    expect(isOverdue(homework({ dueAt: new Date(Date.now() - 86_400_000).toISOString() }))).toBe(
      true
    )
  })

  it('is false past due once submitted', () => {
    expect(
      isOverdue(
        homework({
          dueAt: new Date(Date.now() - 86_400_000).toISOString(),
          mySubmission: { status: 'submitted', submittedAt: '2026-07-01T10:00:00Z' },
        })
      )
    ).toBe(false)
  })
})
