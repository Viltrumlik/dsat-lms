// Domain: Notifications
// Description: Localized rendering of notification content. The backend stores
//   English title/body as a durable fallback; for known types carrying
//   structured data (examTitle, homeworkTitle, className, dueAt) we render
//   client-side templates in the active locale instead.

import { format } from 'date-fns'
import { uz as uzDate } from 'date-fns/locale'
import type { Locale } from '@/lib/i18n/config'
import type { Notification } from '@/types'

type Translate = (key: string, params?: Record<string, string | number>) => string

function str(value: unknown): string | null {
  return typeof value === 'string' && value !== '' ? value : null
}

function dueDate(value: unknown, locale: Locale): string | null {
  const iso = str(value)
  if (!iso) return null
  try {
    return format(new Date(iso), 'PPp', { locale: locale === 'uz' ? uzDate : undefined })
  } catch {
    return null
  }
}

/** Title + body for a notification, localized when type + data allow it. */
export function notificationText(
  notification: Notification,
  t: Translate,
  locale: Locale
): { title: string; body: string } {
  const fallback = { title: notification.title, body: notification.body }
  const data = notification.data ?? {}

  if (notification.type === 'exam_graded') {
    const exam = str(data['examTitle'])
    if (!exam) return fallback
    return { title: t('notifications.templates.examGraded', { exam }), body: '' }
  }

  if (notification.type === 'homework_assigned' || notification.type === 'homework_due') {
    const title = str(data['homeworkTitle'])
    if (!title) return fallback
    const className = str(data['className'])
    const due = dueDate(data['dueAt'], locale)
    const titleKey =
      notification.type === 'homework_assigned'
        ? 'notifications.templates.homeworkAssigned'
        : 'notifications.templates.homeworkDue'
    return {
      title: t(titleKey, { title }),
      body:
        className && due
          ? t('notifications.templates.homeworkBody', { class: className, date: due })
          : '',
    }
  }

  if (notification.type === 'course_assigned') {
    const title = str(data['courseTitle'])
    if (!title) return fallback
    return { title: t('notifications.templates.courseAssigned', { title }), body: '' }
  }

  if (notification.type === 'lead_assigned') {
    const name = str(data['leadName'])
    if (!name) return fallback
    return { title: t('notifications.templates.leadAssigned', { name }), body: '' }
  }

  if (notification.type === 'follow_up_due') {
    const title = str(data['taskTitle'])
    if (!title) return fallback
    return { title: t('notifications.templates.followUpDue', { title }), body: '' }
  }

  if (notification.type === 'support_reply') {
    // Staff-facing rows carry studentName; the student-facing one doesn't.
    const student = str(data['studentName'])
    return {
      title: student
        ? t('notifications.templates.supportReplyFromStudent', { name: student })
        : t('notifications.templates.supportReply'),
      body: '',
    }
  }

  if (notification.type === 'support_recommendation') {
    const topic = str(data['topic'])
    return {
      title: topic
        ? t('notifications.templates.supportRecommendationWithTopic', { topic })
        : t('notifications.templates.supportRecommendation'),
      body: '',
    }
  }

  if (
    notification.type === 'office_hours_reminder' ||
    notification.type === 'office_hours_canceled'
  ) {
    const title = str(data['title'])
    const when = dueDate(data['startsAt'], locale)
    if (!title || !when) return fallback
    const key =
      notification.type === 'office_hours_reminder'
        ? 'notifications.templates.officeHoursReminder'
        : 'notifications.templates.officeHoursCanceled'
    return { title: t(key, { title, date: when }), body: '' }
  }

  // A cancellation can reach either party, so it names no one — just the date.
  if (notification.type === 'booking_cancelled') {
    const when = dueDate(data['scheduledAt'], locale)
    if (!when) return fallback
    return { title: t('notifications.templates.bookingCancelled', { date: when }), body: '' }
  }

  if (notification.type === 'mentor_assigned' || notification.type === 'mentor_checkin_due') {
    const name = str(data['studentName'])
    if (!name) return fallback
    const key =
      notification.type === 'mentor_assigned'
        ? 'notifications.templates.mentorAssigned'
        : 'notifications.templates.mentorCheckinDue'
    return { title: t(key, { name }), body: '' }
  }

  const bookingKeys: Partial<Record<Notification['type'], string>> = {
    booking_requested: 'notifications.templates.bookingRequested',
    booking_confirmed: 'notifications.templates.bookingConfirmed',
    booking_completed: 'notifications.templates.bookingCompleted',
  }
  const bookingKey = bookingKeys[notification.type]
  if (bookingKey) {
    const when = dueDate(data['scheduledAt'], locale)
    // A request lands on the teacher (shows the student); the rest land on the
    // student (show the teacher).
    const name =
      notification.type === 'booking_requested'
        ? str(data['studentName'])
        : str(data['teacherName'])
    if (!when || !name) return fallback
    return { title: t(bookingKey, { name, date: when }), body: '' }
  }

  return fallback
}
