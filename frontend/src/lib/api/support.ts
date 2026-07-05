// ═══════════════════════════════════════
// DSAT LMS v2 — Support Center API (S1 Book a Teacher)
// Domain: Support
// Description: Student discovery + booking (create/list/cancel/rate), teacher
//   availability (self-service), and staff booking management (status + outcome).
//   Bodies/params are camelCase — the client transforms to snake_case.
// ═══════════════════════════════════════

import { del, get, getPaginated, patch, post } from './client'
import type {
  BookableTeacher,
  BookingStatus,
  StaffSessionOutcome,
  StaffSupportBooking,
  SupportBooking,
  SupportSlot,
  SupportSubject,
  SupportTicket,
  SupportTicketSummary,
  TeacherAvailability,
  TicketPriority,
  TicketStatus,
} from '@/types'

export interface CreateBookingPayload {
  teacher: string
  subject: SupportSubject
  scheduledAt: string // ISO datetime from a slot
  topic?: string
  reason?: string
}

export interface SlotsParams {
  teacher: string
  subject: SupportSubject
  days?: number
}

export interface AvailabilityPayload {
  subject: SupportSubject
  weekday: number
  startTime: string // "HH:MM"
  endTime: string
  slotMinutes?: number
  isActive?: boolean
}

export interface OutcomePayload {
  topicsCovered?: string
  homework?: string
  nextRecommendation?: string
  notes?: string
}

export interface StatusChangePayload {
  status: 'confirmed' | 'completed' | 'cancelled' | 'no_show'
  actualDurationMinutes?: number
}

export interface BookingListParams {
  status?: BookingStatus
  cursor?: string
}

export const supportAPI = {
  /** Teachers offering 1:1 support, optionally filtered by subject. */
  bookableTeachers: (subject?: SupportSubject) =>
    get<BookableTeacher[]>('/support/bookable-teachers/', subject ? { subject } : undefined),

  /** Bookable slots for a teacher + subject over the next `days` (default 14). */
  slots: (params: SlotsParams) => get<SupportSlot[]>('/support/slots/', params),

  bookings: {
    list: (params: BookingListParams = {}) =>
      getPaginated<SupportBooking>('/support/bookings/', params),
    get: (id: string) => get<SupportBooking>(`/support/bookings/${id}/`),
    create: (payload: CreateBookingPayload) =>
      post<SupportBooking>('/support/bookings/', payload),
    cancel: (id: string) => post<SupportBooking>(`/support/bookings/${id}/cancel/`),
    rate: (id: string, payload: { score: number; comment?: string }) =>
      post<SupportBooking>(`/support/bookings/${id}/rate/`, payload),
  },

  /** Teacher's own availability windows (self-service). */
  availability: {
    list: () => get<TeacherAvailability[]>('/support/availability/'),
    create: (payload: AvailabilityPayload) =>
      post<TeacherAvailability>('/support/availability/', payload),
    update: (id: string, payload: Partial<AvailabilityPayload>) =>
      patch<TeacherAvailability>(`/support/availability/${id}/`, payload),
    remove: (id: string) => del<void>(`/support/availability/${id}/`),
  },

  /** Staff booking management (row-scoped to the teacher server-side). */
  staffBookings: {
    list: (params: BookingListParams = {}) =>
      getPaginated<StaffSupportBooking>('/support/staff/bookings/', params),
    get: (id: string) => get<StaffSupportBooking>(`/support/staff/bookings/${id}/`),
    changeStatus: (id: string, payload: StatusChangePayload) =>
      post<StaffSupportBooking>(`/support/staff/bookings/${id}/status/`, payload),
    outcome: (id: string, payload: OutcomePayload) =>
      post<StaffSessionOutcome>(`/support/staff/bookings/${id}/outcome/`, payload),
  },

  /** Ask a Question — a student's own tickets. */
  tickets: {
    list: (params: { status?: TicketStatus; cursor?: string } = {}) =>
      getPaginated<SupportTicketSummary>('/support/tickets/', params),
    get: (id: string) => get<SupportTicket>(`/support/tickets/${id}/`),
    create: (payload: CreateTicketPayload) => post<SupportTicket>('/support/tickets/', payload),
    reply: (id: string, body: string) =>
      post<SupportTicket>(`/support/tickets/${id}/replies/`, { body }),
    setStatus: (id: string, status: 'open' | 'closed') =>
      post<SupportTicket>(`/support/tickets/${id}/status/`, { status }),
  },

  /** Staff ticket queue (shared pool — any staff sees all). */
  staffTickets: {
    list: (params: { status?: TicketStatus; assigned?: 'me' | 'unassigned'; cursor?: string } = {}) =>
      getPaginated<SupportTicketSummary>('/support/staff/tickets/', params),
    get: (id: string) => get<SupportTicket>(`/support/staff/tickets/${id}/`),
    reply: (id: string, body: string) =>
      post<SupportTicket>(`/support/staff/tickets/${id}/replies/`, { body }),
    assign: (id: string, assignee: string | null) =>
      post<SupportTicket>(`/support/staff/tickets/${id}/assign/`, { assignee }),
    setStatus: (id: string, status: 'open' | 'closed') =>
      post<SupportTicket>(`/support/staff/tickets/${id}/status/`, { status }),
  },
}

export interface CreateTicketPayload {
  subject: SupportSubject
  body: string
  priority?: TicketPriority
  attachmentIds?: string[]
}
