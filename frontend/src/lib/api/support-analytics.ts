// ═══════════════════════════════════════
// DSAT LMS v2 — Support analytics API (S3)
// Domain: Support
// Description: Read-only KPI reads. Staff = own vs. all (row-scoped server-side);
//   student = own self-summary.
// ═══════════════════════════════════════

import { get } from './client'
import type { StaffSupportAnalytics, StudentSupportSummary } from '@/types'

export const supportAnalyticsAPI = {
  staff: () => get<StaffSupportAnalytics>('/support/staff/analytics/'),
  studentSummary: () => get<StudentSupportSummary>('/support/analytics/'),
}
