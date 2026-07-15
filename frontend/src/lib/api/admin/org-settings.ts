// ═══════════════════════════════════════
// DSAT LMS v2 — Admin Org Settings API (Phase 5.0b)
// Domain: Identity (admin)
// Description: Read/update the org-settings singleton (branding, academic year,
//   grading scheme, feature flags). IsAdmin.
// ═══════════════════════════════════════

import { get, patch } from '../client'
import type { OrgSetting } from '@/types'

export const adminOrgSettingsAPI = {
  /** The org-settings singleton. */
  get: () => get<OrgSetting>('/admin/org-settings/'),

  /** Partial update; returns the fresh settings. */
  update: (payload: Partial<OrgSetting>) => patch<OrgSetting>('/admin/org-settings/', payload),
}
