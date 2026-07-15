// Domain: Analytics (admin)
// Description: The dashboard's recent-activity feed — the latest audit-log rows
//   (who did what, when). Read-only; deep-links to the full activity log.
'use client'

import Link from 'next/link'
import { formatDistanceToNow } from 'date-fns'
import { uz as uzDate } from 'date-fns/locale'
import { ScrollText } from 'lucide-react'
import { useI18n } from '@/lib/i18n/I18nProvider'
import { Card, CardContent } from '@/components/ui/card'
import type { ActivityLog } from '@/types'

export function RecentActivityFeed({ items }: { items: ActivityLog[] }) {
  const { t, locale } = useI18n()

  return (
    <Card>
      <CardContent className="space-y-4 p-5">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">{t('admin.dashboard.recentActivity')}</h2>
          <Link href="/admin/audit" className="text-sm text-primary-700 hover:underline dark:text-primary-300">
            {t('admin.dashboard.viewAll')}
          </Link>
        </div>

        {items.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-6 text-center text-sm text-muted-foreground">
            <ScrollText className="h-6 w-6" />
            {t('admin.dashboard.noActivity')}
          </div>
        ) : (
          <ul className="space-y-3">
            {items.map((a) => (
              <li key={a.id} className="flex items-start gap-3 text-sm">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary-500" />
                <div className="min-w-0">
                  <p className="truncate">
                    <span className="font-medium">
                      {a.actorName || a.actorEmail || t('admin.audit.system')}
                    </span>{' '}
                    <span className="text-muted-foreground">{a.summary || a.action}</span>
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {formatDistanceToNow(new Date(a.createdAt), {
                      addSuffix: true,
                      locale: locale === 'uz' ? uzDate : undefined,
                    })}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
