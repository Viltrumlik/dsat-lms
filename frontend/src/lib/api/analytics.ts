// ═══════════════════════════════════════
// DSAT LMS v2 — Analytics API
// Domain: Analytics
// Description: Read-only dashboards data (summary now; progress/rankings Phase 2).
// ═══════════════════════════════════════

import { get } from './client'
import type { AnalyticsSummary, CategoryProgress, RankingEntry } from '@/types'

export const analyticsAPI = {
  summary: () => get<AnalyticsSummary>('/analytics/summary/'),
  progress: () => get<CategoryProgress[]>('/analytics/progress/'),
  rankings: () => get<RankingEntry[]>('/analytics/rankings/'),
}
