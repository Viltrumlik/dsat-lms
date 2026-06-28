// ═══════════════════════════════════════
// DSAT LMS v2 — Auth API
// Domain: Identity
// Description: Register / login / logout / refresh / me + email & password flows.
//   Access token lives in memory (AuthProvider); refresh is an HttpOnly cookie.
//   Verification & reset links carry uid + token and land on the frontend, which
//   POSTs them to the matching /confirm/ endpoint.
// ═══════════════════════════════════════

import { post, get } from './client'
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

  /** Exchange the refresh cookie for a fresh access token. */
  refresh: () => post<{ accessToken: string }>('/auth/refresh/'),

  me: () => get<{ user: User }>('/auth/me/'),

  /** Resend verification to the logged-in user (authenticated, no body). */
  resendVerification: () => post<{ detail: string }>('/auth/verify-email/resend/'),

  confirmVerification: (payload: { uid: string; token: string }) =>
    post<unknown>('/auth/verify-email/confirm/', payload),

  requestPasswordReset: (email: string) =>
    post<{ detail: string }>('/auth/password/reset/', { email }),

  confirmPasswordReset: (payload: { uid: string; token: string; newPassword: string }) =>
    post<unknown>('/auth/password/reset/confirm/', payload),

  changePassword: (payload: { currentPassword: string; newPassword: string }) =>
    post<unknown>('/auth/password/change/', payload),
}
