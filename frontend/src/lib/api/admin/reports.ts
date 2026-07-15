// ═══════════════════════════════════════
// DSAT LMS v2 — Admin Reports API (Phase 5.3b)
// Domain: Analytics (admin)
// Description: Download tabular reports (CSV/xlsx). A plain <a> can't send the
//   Bearer token and the axios client mangles blobs, so this uses a bare auth'd
//   fetch (mirrors filesAPI.download). IsAdmin.
// ═══════════════════════════════════════

import { getAccessToken } from '../client'

const API = `${process.env.NEXT_PUBLIC_API_URL || ''}/api/v1`

export type ReportKind = 'students' | 'attendance'
export type ReportFormat = 'csv' | 'xlsx'

export const adminReportsAPI = {
  download: async (kind: ReportKind, fmt: ReportFormat, params: { classId?: string } = {}) => {
    const qs = new URLSearchParams({ fmt })
    if (params.classId) qs.set('class_id', params.classId)
    const url = `${API}/admin/reports/${kind}/?${qs.toString()}`
    const token = getAccessToken()
    const res = await fetch(url, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      credentials: 'include',
    })
    if (!res.ok) throw new Error('Download failed')
    const blob = await res.blob()
    const objUrl = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = objUrl
    a.download = `${kind}-report.${fmt}`
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(objUrl)
  },
}
