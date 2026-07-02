// Domain: Notifications
// Description: Full notifications page — cursor list, mark-read, mark-all.
'use client'

import { useT } from '@/lib/i18n/I18nProvider'
import { NotificationsList } from '@/components/notifications/NotificationsList'

export default function NotificationsPage() {
  const t = useT()
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t('notifications.title')}</h1>
        <p className="text-muted-foreground">{t('notifications.subtitle')}</p>
      </div>
      <NotificationsList />
    </div>
  )
}
