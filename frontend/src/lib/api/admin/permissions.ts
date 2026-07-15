// ═══════════════════════════════════════
// DSAT LMS v2 — Admin Permissions Matrix API (Phase 5.6a)
// Domain: Identity (admin)
// Description: Read/update the role→capability matrix. Sparse admin overrides on
//   the hardcoded defaults; drives UI capability gating (enforcement stays
//   role-based server-side). IsAdmin.
// ═══════════════════════════════════════

import { get, put } from '../client'
import type { PermissionMatrix, PermissionOverride } from '@/types'

export const adminPermissionsAPI = {
  /** The effective matrix: per-role cells with allowed/default/overridden. */
  getMatrix: () => get<PermissionMatrix>('/admin/permissions/matrix/'),

  /** Upsert override cells (reverting a cell to its default drops the override). */
  updateMatrix: (overrides: PermissionOverride[]) =>
    put<PermissionMatrix>('/admin/permissions/matrix/', { overrides }),
}
