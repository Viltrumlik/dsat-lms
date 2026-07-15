// Domain: Analytics (admin)
// Description: The dashboard's action center — each alert answers "what should the
//   admin do now?" with a count + a deep-link CTA. Empty = an all-clear state.
'use client'

import Link from 'next/link'
import { AlertTriangle, ArrowRight, CheckCircle2 } from 'lucide-react'
import { useT } from '@/lib/i18n/I18nProvider'
import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils/cn'
import type { DashboardAlert } from '@/types'

export function AlertsCenter({ alerts }: { alerts: DashboardAlert[] }) {
  const t = useT()

  if (alerts.length === 0) {
    return (
      <Card>
        <CardContent className="flex items-center gap-3 p-5 text-sm text-muted-foreground">
          <CheckCircle2 className="h-5 w-5 text-success-dark" />
          {t('admin.dashboard.alerts.allClear')}
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardContent className="divide-y divide-border p-0">
        {alerts.map((a) => (
          <div key={a.kind} className="flex items-center gap-3 px-5 py-3">
            <span
              className={cn(
                'flex h-8 w-8 shrink-0 items-center justify-center rounded-full',
                a.severity === 'red'
                  ? 'bg-error/10 text-error'
                  : 'bg-warning/10 text-warning-dark'
              )}
            >
              <AlertTriangle className="h-4 w-4" />
            </span>
            <span className="min-w-0 flex-1 text-sm">
              {t(`admin.dashboard.alerts.${a.kind}`, { count: a.count })}
            </span>
            {a.url && (
              <Link
                href={a.url}
                className="inline-flex shrink-0 items-center gap-1 text-sm font-medium text-primary-700 hover:underline dark:text-primary-300"
              >
                {t('admin.dashboard.alerts.view')}
                <ArrowRight className="h-4 w-4" />
              </Link>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  )
}
