import { describe, it, expect } from 'vitest'
import { notificationHref } from './link'
import type { Notification, NotificationType } from '@/types'

function notification(
  type: NotificationType,
  data: Record<string, unknown> = {}
): Notification {
  return {
    id: 'n-1',
    type,
    title: 'Title',
    body: '',
    data,
    isRead: false,
    readAt: null,
    createdAt: '2026-07-02T10:00:00Z',
  }
}

describe('notificationHref', () => {
  it('routes exam_graded to the session results', () => {
    expect(notificationHref(notification('exam_graded', { sessionId: 'abc' }))).toBe(
      '/results/abc'
    )
  })

  it('routes homework notifications to the homework detail', () => {
    expect(notificationHref(notification('homework_assigned', { homeworkId: 'hw1' }))).toBe(
      '/homework/hw1'
    )
    expect(notificationHref(notification('homework_due', { homeworkId: 'hw2' }))).toBe(
      '/homework/hw2'
    )
  })

  it('prefers an explicit app-relative data.url', () => {
    expect(notificationHref(notification('announcement', { url: '/analytics' }))).toBe(
      '/analytics'
    )
  })

  it('ignores external / malformed urls', () => {
    expect(notificationHref(notification('announcement', { url: 'https://evil.example' }))).toBe(
      null
    )
  })

  it('returns null when there is nothing to link to', () => {
    expect(notificationHref(notification('system'))).toBe(null)
    expect(notificationHref(notification('exam_graded'))).toBe(null)
  })
})
