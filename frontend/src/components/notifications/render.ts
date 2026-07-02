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

  return fallback
}
