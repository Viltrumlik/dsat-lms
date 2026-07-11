// ═══════════════════════════════════════
// DSAT LMS v2 — Admin Audit API (Phase 5.0c)
// Domain: Audit (admin)
// Description: The activity log — filterable, cursor-paginated, plus the distinct
//   action/target vocab for filter dropdowns. IsAdmin.
// ═══════════════════════════════════════

import { get, getPaginated } from '../client'
import type { ActivityLog } from '@/types'

export interface AuditListParams {
  actor?: string
  action?: string
  targetType?: string
  from?: string
  to?: string
  q?: string
  cursor?: string
}

export interface AuditVocab {
  actions: string[]
  targetTypes: string[]
}

export const adminAuditAPI = {
  /** Filterable, cursor-paginated activity log. */
  list: (params: AuditListParams = {}) => getPaginated<ActivityLog>('/admin/audit/', params),

  /** Distinct action + target-type values (filter dropdowns). */
  actions: () => get<AuditVocab>('/admin/audit/actions/'),
}
