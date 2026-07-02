// ═══════════════════════════════════════
// DSAT LMS v2 — Notifications API
// Domain: Notifications
// Description: In-app notifications — cursor-paginated list (?unread=1 filter),
//   unread count for the navbar bell, and mark-read / mark-all-read.
// ═══════════════════════════════════════

import { get, post, getPaginated } from './client'
import type { Notification } from '@/types'

export interface NotificationListParams {
  unread?: boolean
  cursor?: string
}

export const notificationAPI = {
  /** Newest first, cursor-paginated. Returns `{ data, pagination }`. */
  list: (params?: NotificationListParams) =>
    getPaginated<Notification>('/notifications/', params),

  unreadCount: () => get<{ unread: number }>('/notifications/unread-count/'),

  markRead: (id: string) => post<Notification>(`/notifications/${id}/read/`),

  markAllRead: () => post<{ markedRead: number }>('/notifications/read-all/'),
}
