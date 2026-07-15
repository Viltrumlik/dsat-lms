// ═══════════════════════════════════════
// DSAT LMS v2 — Admin Global Search API (Phase 5.1a)
// Domain: Identity (admin)
// Description: Grouped hits across users/questions/exams/classes for the ⌘K
//   command palette. IsAdmin.
// ═══════════════════════════════════════

import { get } from '../client'
import type { SearchResults } from '@/types'

export const adminSearchAPI = {
  query: (q: string) => get<SearchResults>(`/admin/search/?q=${encodeURIComponent(q)}`),
}
