import { describe, it, expect } from 'vitest'
import { notificationText } from './render'
import type { Notification, NotificationType } from '@/types'

// Stub t: returns "key|{params}" so we can assert key + param selection.
const t = (key: string, params?: Record<string, string | number>) =>
  `${key}|${JSON.stringify(params ?? {})}`

function notification(
  type: NotificationType,
  data: Record<string, unknown> = {}
): Notification {
  return {
    id: 'n-1',
    type,
    title: 'Server title',
    body: 'Server body',
    data,
    isRead: false,
    readAt: null,
    createdAt: '2026-07-02T10:00:00Z',
  }
}

describe('notificationText', () => {
  it('renders exam_graded from examTitle', () => {
    const { title, body } = notificationText(
      notification('exam_graded', { examTitle: 'Mock 1' }),
      t,
      'en'
    )
    expect(title).toBe('notifications.templates.examGraded|{"exam":"Mock 1"}')
    expect(body).toBe('')
  })

  it('renders homework_assigned title + body from structured data', () => {
    const { title, body } = notificationText(
      notification('homework_assigned', {
        homeworkTitle: 'Algebra set',
        className: 'SAT Morning',
        dueAt: '2026-07-05T09:00:00Z',
      }),
      t,
      'en'
    )
    expect(title).toBe('notifications.templates.homeworkAssigned|{"title":"Algebra set"}')
    expect(body).toContain('notifications.templates.homeworkBody|')
    expect(body).toContain('"class":"SAT Morning"')
  })

  it('renders homework_due with the due template', () => {
    const { title } = notificationText(
      notification('homework_due', { homeworkTitle: 'Essay' }),
      t,
      'en'
    )
    expect(title).toBe('notifications.templates.homeworkDue|{"title":"Essay"}')
  })

  it('omits the body when structured fields are incomplete', () => {
    const { body } = notificationText(
      notification('homework_assigned', { homeworkTitle: 'Essay' }),
      t,
      'en'
    )
    expect(body).toBe('')
  })

  it('falls back to server strings for old rows and unknown types', () => {
    expect(notificationText(notification('exam_graded'), t, 'en')).toEqual({
      title: 'Server title',
      body: 'Server body',
    })
    expect(notificationText(notification('announcement'), t, 'en')).toEqual({
      title: 'Server title',
      body: 'Server body',
    })
  })
})
