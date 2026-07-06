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

  it('renders booking_confirmed from the teacher name + scheduledAt', () => {
    const { title, body } = notificationText(
      notification('booking_confirmed', {
        teacherName: 'Ali Valiyev',
        scheduledAt: '2026-07-08T09:00:00Z',
      }),
      t,
      'en'
    )
    expect(title).toContain('notifications.templates.bookingConfirmed|')
    expect(title).toContain('"name":"Ali Valiyev"')
    expect(body).toBe('')
  })

  it('renders booking_requested from the student name (teacher-facing)', () => {
    const { title } = notificationText(
      notification('booking_requested', {
        studentName: 'Dilnoza K',
        teacherName: 'Ali Valiyev',
        scheduledAt: '2026-07-08T09:00:00Z',
      }),
      t,
      'en'
    )
    expect(title).toContain('notifications.templates.bookingRequested|')
    expect(title).toContain('"name":"Dilnoza K"')
  })

  it('falls back when a booking notification lacks scheduledAt', () => {
    expect(notificationText(notification('booking_confirmed', { teacherName: 'Ali' }), t, 'en')).toEqual({
      title: 'Server title',
      body: 'Server body',
    })
  })

  it('renders support_reply (student-facing, no name)', () => {
    const { title } = notificationText(notification('support_reply', { ticketId: 't1' }), t, 'en')
    expect(title).toBe('notifications.templates.supportReply|{}')
  })

  it('renders support_reply from a student name (staff-facing)', () => {
    const { title } = notificationText(
      notification('support_reply', { studentName: 'Dilnoza K', ticketId: 't1' }),
      t,
      'en'
    )
    expect(title).toContain('notifications.templates.supportReplyFromStudent|')
    expect(title).toContain('"name":"Dilnoza K"')
  })

  it('renders support_recommendation with a topic', () => {
    const { title } = notificationText(
      notification('support_recommendation', { topic: 'Algebra', subject: 'math' }),
      t,
      'en'
    )
    expect(title).toContain('notifications.templates.supportRecommendationWithTopic|')
    expect(title).toContain('"topic":"Algebra"')
  })

  it('renders support_recommendation without a topic', () => {
    const { title } = notificationText(notification('support_recommendation', {}), t, 'en')
    expect(title).toBe('notifications.templates.supportRecommendation|{}')
  })

  it('renders office_hours_reminder from title + startsAt', () => {
    const { title } = notificationText(
      notification('office_hours_reminder', { title: 'Math drop-in', startsAt: '2026-07-08T15:00:00Z' }),
      t,
      'en'
    )
    expect(title).toContain('notifications.templates.officeHoursReminder|')
    expect(title).toContain('"title":"Math drop-in"')
  })

  it('renders office_hours_canceled', () => {
    const { title } = notificationText(
      notification('office_hours_canceled', { title: 'Math drop-in', startsAt: '2026-07-08T15:00:00Z' }),
      t,
      'en'
    )
    expect(title).toContain('notifications.templates.officeHoursCanceled|')
  })

  it('falls back for office hours without startsAt', () => {
    expect(notificationText(notification('office_hours_reminder', { title: 'X' }), t, 'en')).toEqual({
      title: 'Server title',
      body: 'Server body',
    })
  })

  it('renders mentor_assigned from studentName', () => {
    const { title, body } = notificationText(
      notification('mentor_assigned', { studentName: 'Aziza K.' }),
      t,
      'en'
    )
    expect(title).toBe('notifications.templates.mentorAssigned|{"name":"Aziza K."}')
    expect(body).toBe('')
  })

  it('renders mentor_checkin_due from studentName', () => {
    const { title } = notificationText(
      notification('mentor_checkin_due', { studentName: 'Aziza K.' }),
      t,
      'en'
    )
    expect(title).toBe('notifications.templates.mentorCheckinDue|{"name":"Aziza K."}')
  })

  it('falls back for mentor notifications without studentName', () => {
    expect(notificationText(notification('mentor_assigned'), t, 'en')).toEqual({
      title: 'Server title',
      body: 'Server body',
    })
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
