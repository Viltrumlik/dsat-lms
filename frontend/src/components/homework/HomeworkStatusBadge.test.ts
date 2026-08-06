import { describe, it, expect } from 'vitest'
import { homeworkStatusOf, isOverdue } from './HomeworkStatusBadge'
import type { Homework, HomeworkMySubmission, HomeworkStatus } from '@/types'

function submission(status: HomeworkStatus): HomeworkMySubmission {
  return {
    id: 'sub-1',
    status,
    submittedAt: '2026-07-01T10:00:00Z',
    responseText: '',
    isLate: false,
    attemptNumber: 1,
    returnedAt: null,
    grade: null,
    gradeScale: 100,
    feedback: '',
    gradedAt: null,
    files: [],
    events: [],
  }
}

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
    attachments: [],
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
    expect(homeworkStatusOf(homework({ mySubmission: submission('submitted') }))).toBe('submitted')
    expect(homeworkStatusOf(homework({ mySubmission: submission('graded') }))).toBe('graded')
    expect(homeworkStatusOf(homework({ mySubmission: submission('returned') }))).toBe('returned')
  })
})

describe('isOverdue', () => {
  const yesterday = new Date(Date.now() - 86_400_000).toISOString()

  it('is false before the due date', () => {
    expect(isOverdue(homework())).toBe(false)
  })

  it('is true past due while still unsubmitted', () => {
    expect(isOverdue(homework({ dueAt: yesterday }))).toBe(true)
  })

  it('is false past due once submitted', () => {
    expect(
      isOverdue(homework({ dueAt: yesterday, mySubmission: submission('submitted') }))
    ).toBe(false)
  })

  it('is true past due when handed back for revision', () => {
    // A returned piece is outstanding work again — the action is on the student.
    expect(isOverdue(homework({ dueAt: yesterday, mySubmission: submission('returned') }))).toBe(
      true
    )
  })

  it('is false past due once graded', () => {
    expect(isOverdue(homework({ dueAt: yesterday, mySubmission: submission('graded') }))).toBe(
      false
    )
  })
})
