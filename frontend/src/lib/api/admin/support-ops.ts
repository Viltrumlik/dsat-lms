// ═══════════════════════════════════════
// DSAT LMS v2 — Admin Support Ops API (Phase 4 S7)
// Domain: Support (admin)
// Description: The admin ops dashboard — platform-wide live KPIs + a daily trend
//   series. `rebuild` regenerates today's/yesterday's rollup on demand. IsAdmin.
// ═══════════════════════════════════════

import { get, post } from '../client'
import type { SupportOpsOverview } from '@/types'

export const adminSupportOpsAPI = {
  /** Live KPIs + the last `days` of daily flow metrics. */
  overview: (days = 30) => get<SupportOpsOverview>(`/admin/support-ops/?days=${days}`),

  /** Regenerate today's + yesterday's rollup, then return the refreshed overview. */
  rebuild: (days = 30) => post<SupportOpsOverview>(`/admin/support-ops/rebuild/?days=${days}`, {}),
}
