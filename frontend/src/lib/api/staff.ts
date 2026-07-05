// ═══════════════════════════════════════
// DSAT LMS v2 — Staff API
// Domain: Identity (staff)
// Description: The access-matrix endpoint — a machine-readable role→capability map
//   the frontend gates UI off, mirroring exactly what the API enforces server-side.
//   Capabilities are static per role, so the hook caches them indefinitely.
// ═══════════════════════════════════════

import { useQuery } from '@tanstack/react-query'

import type { UserRole } from '@/types'

import { get } from './client'

// Keys arrive camelCased (the client camelizes all response keys).
export interface RoleCapabilities {
  readAllStudents: boolean
  readAcademic: boolean
  writeOperational: boolean
  writeAcademic: boolean
  grade: boolean
  manageUsers: boolean
}

export interface AccessMatrix {
  /** The caller's own role. */
  role: UserRole
  /** The caller's own capabilities (convenience — same as matrix[role]). */
  capabilities: RoleCapabilities
  /** Every staff role's capabilities (a list so role stays a value, not a key). */
  matrix: { role: UserRole; capabilities: RoleCapabilities }[]
}

export const staffAPI = {
  getAccessMatrix: () => get<AccessMatrix>('/staff/access-matrix/'),
}

/** Cached role capabilities for the current staff user; use to gate UI. */
export function useAccessMatrix() {
  return useQuery({
    queryKey: ['staff', 'access-matrix'],
    queryFn: staffAPI.getAccessMatrix,
    staleTime: Infinity,
  })
}
