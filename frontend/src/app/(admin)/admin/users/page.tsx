// Domain: Admin
// Description: User management — list/filter/search + create/edit/role/status/delete.
'use client'

import { useT } from '@/lib/i18n/I18nProvider'
import { UsersView } from '@/components/admin/UsersView'

export default function AdminUsersPage() {
  const t = useT()
  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t('admin.users.title')}</h1>
        <p className="text-muted-foreground">{t('admin.users.subtitle')}</p>
      </div>
      <UsersView />
    </div>
  )
}
