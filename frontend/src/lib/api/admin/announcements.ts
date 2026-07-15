// ═══════════════════════════════════════
// DSAT LMS v2 — Admin Announcements API (Phase 5.2c)
// Domain: Notifications (admin)
// Description: Compose / list / send broadcasts + manage message templates. IsAdmin.
// ═══════════════════════════════════════

import { del, get, getPaginated, patch, post } from '../client'
import type { Announcement, AnnouncementAudience, MessageTemplate } from '@/types'

export interface AnnouncementPayload {
  title: string
  body: string
  audienceType: AnnouncementAudience
  audienceRef?: string
  channels: string[]
}

export interface SendResult {
  sent: number
  failed: number
}

export const adminAnnouncementsAPI = {
  list: (cursor?: string) => getPaginated<Announcement>('/admin/announcements/', { cursor }),
  create: (payload: AnnouncementPayload) => post<Announcement>('/admin/announcements/', payload),
  update: (id: string, payload: Partial<AnnouncementPayload>) =>
    patch<Announcement>(`/admin/announcements/${id}/`, payload),
  remove: (id: string) => del<void>(`/admin/announcements/${id}/`),
  send: (id: string) => post<Announcement & SendResult>(`/admin/announcements/${id}/send/`, {}),
}

export const adminMessageTemplatesAPI = {
  list: () => get<MessageTemplate[]>('/admin/message-templates/'),
  create: (payload: { name: string; subject?: string; body: string }) =>
    post<MessageTemplate>('/admin/message-templates/', payload),
  remove: (id: string) => del<void>(`/admin/message-templates/${id}/`),
}
