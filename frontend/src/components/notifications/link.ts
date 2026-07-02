// Domain: Notifications
// Description: Maps a notification to its in-app destination. `data` keys are
//   camelized by the API client (session_id → sessionId). An explicit data.url
//   (app-relative) wins; unknown shapes yield null (row just marks as read).

import type { Notification } from '@/types'

export function notificationHref(notification: Notification): string | null {
  const data = notification.data ?? {}

  const url = data['url']
  if (typeof url === 'string' && url.startsWith('/')) return url

  const sessionId = data['sessionId']
  if (notification.type === 'exam_graded' && typeof sessionId === 'string') {
    return `/results/${sessionId}`
  }

  const homeworkId = data['homeworkId']
  if (
    (notification.type === 'homework_assigned' || notification.type === 'homework_due') &&
    typeof homeworkId === 'string'
  ) {
    return `/homework/${homeworkId}`
  }

  return null
}
