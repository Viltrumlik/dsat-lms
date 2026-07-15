// ═══════════════════════════════════════
// DSAT LMS v2 — Admin Automation API (Phase 5.6b/c)
// Domain: Automation (admin)
// Description: Rule CRUD + the builder catalog + dry-run + on-demand sweep + run
//   log. The condition tree / action list travel as opaque JSON (all-lowercase
//   keys, so the camel↔snake transform is a no-op on them). IsAdmin.
// ═══════════════════════════════════════

import { del, get, getPaginated, patch, post } from '../client'
import type {
  AutomationCatalog,
  AutomationDryRun,
  AutomationLog,
  AutomationRule,
  AutomationRuleInput,
  AutomationSweepResult,
} from '@/types'

export const automationAPI = {
  catalog: () => get<AutomationCatalog>('/admin/automation/catalog/'),

  listRules: (params?: { enabled?: boolean; trigger_type?: string; cursor?: string }) =>
    getPaginated<AutomationRule>('/admin/automation/rules/', params),

  getRule: (id: string) => get<AutomationRule>(`/admin/automation/rules/${id}/`),

  createRule: (payload: AutomationRuleInput) =>
    post<AutomationRule>('/admin/automation/rules/', payload),

  updateRule: (id: string, payload: Partial<AutomationRuleInput>) =>
    patch<AutomationRule>(`/admin/automation/rules/${id}/`, payload),

  deleteRule: (id: string) => del<void>(`/admin/automation/rules/${id}/`),

  /** Dry-run a saved rule against the cohort — no side effects. */
  testRule: (id: string) => post<AutomationDryRun>(`/admin/automation/rules/${id}/test/`, {}),

  /** Trigger the scheduled sweep now (verification / manual run). */
  runSweep: () => post<AutomationSweepResult>('/admin/automation/run/', {}),

  listLogs: (params?: { rule?: string; status?: string; cursor?: string }) =>
    getPaginated<AutomationLog>('/admin/automation/logs/', params),
}
