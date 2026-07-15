// ═══════════════════════════════════════
// DSAT LMS v2 — Admin Platform Analytics API (Phase 5.3c)
// Domain: Analytics (admin)
// Description: Platform insights — weakest students, most-active teachers, exam
//   difficulty, attendance by class. IsAdmin.
// ═══════════════════════════════════════

import { get } from '../client'
import type { PlatformAnalytics } from '@/types'

export const adminPlatformAnalyticsAPI = {
  overview: () => get<PlatformAnalytics>('/admin/analytics/'),
}
