// Domain: Admin (CRM)
// Description: Leads pipeline kanban.
'use client'

import { useT } from '@/lib/i18n/I18nProvider'
import { LeadsBoard } from '@/components/admin/LeadsBoard'

export default function AdminLeadsPage() {
  const t = useT()
  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t('admin.leads.title')}</h1>
        <p className="text-muted-foreground">{t('admin.leads.subtitle')}</p>
      </div>
      <LeadsBoard />
    </div>
  )
}
