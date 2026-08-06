// ═══════════════════════════════════════
// DSAT LMS v2 — Auth API
// Domain: Identity
// Description: Register / login / logout / refresh / me + email & password flows.
//   Access token lives in memory (AuthProvider); refresh is an HttpOnly cookie.
//   Verification & reset are six-digit CODES, not links — see apps/mailer.
//   POSTs them to the matching /confirm/ endpoint.
// ═══════════════════════════════════════

import { post, get, patch, refreshAccessToken } from './client'
import type { AuthSession, User } from '@/types'

export interface RegisterPayload {
  email: string
  password: string
  firstName: string
  lastName: string
}

export interface LoginPayload {
  email: string
  password: string
}

export const authAPI = {
  register: (payload: RegisterPayload) => post<AuthSession>('/auth/register/', payload),

  login: (payload: LoginPayload) => post<AuthSession>('/auth/login/', payload),

  logout: () => post<unknown>('/auth/logout/'),

  /** Exchange the refresh cookie for a fresh access token (bare client — no Bearer). */
  refresh: async (): Promise<{ accessToken: string }> => ({
    accessToken: await refreshAccessToken(),
  }),

  me: () => get<{ user: User }>('/auth/me/'),

  /** Self-service profile update (name, target score, exam date, timezone). */
  updateMe: (payload: {
    firstName?: string
    lastName?: string
    satTargetScore?: number | null
    examDate?: string | null
    timezone?: string
  }) => patch<{ user: User }>('/auth/me/', payload),

  /** Resend verification to the logged-in user (authenticated, no body). */
  resendVerification: () =>
    post<{ detail: string; expiresInMinutes: number }>('/auth/verify-email/resend/'),

  /** Verify an address with the code that was emailed to it. */
  confirmVerification: (payload: { email: string; code: string }) =>
    post<{ detail: string; user?: User }>('/auth/verify-email/confirm/', payload),

  requestPasswordReset: (email: string) =>
    post<{ detail: string; expiresInMinutes: number }>('/auth/password/reset/', { email }),

  confirmPasswordReset: (payload: { email: string; code: string; newPassword: string }) =>
    post<{ detail: string }>('/auth/password/reset/confirm/', payload),

  changePassword: (payload: { currentPassword: string; newPassword: string }) =>
    post<unknown>('/auth/password/change/', payload),
}
