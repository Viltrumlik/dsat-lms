// ═══════════════════════════════════════
// DSAT LMS v2 — Admin Dashboard API (Phase 5.1)
// Domain: Analytics (admin)
// Description: The executive control-center overview — KPIs, today, alerts, recent
//   activity, and a daily-flow trend series. `rebuild` re-rolls the trend window.
//   IsAdmin.
// ═══════════════════════════════════════

import { get, post } from '../client'
import type { DashboardOverview } from '@/types'

export const adminDashboardAPI = {
  overview: (days = 30) => get<DashboardOverview>(`/admin/dashboard/?days=${days}`),
  rebuild: (days = 30) => post<DashboardOverview>(`/admin/dashboard/rebuild/?days=${days}`, {}),
}
