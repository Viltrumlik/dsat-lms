// Domain: UI
// Description: KPI stat card — icon badge + big value + label + optional hint.
//   Shared primitive (was duplicated inline in SummaryCards + SupportOpsView).
import * as React from 'react'
import { cn } from '@/lib/utils/cn'
import { Card, CardContent } from '@/components/ui/card'

export function StatCard({
  label,
  value,
  icon: Icon,
  hint,
  className,
}: {
  label: string
  value: string
  icon: React.ComponentType<{ className?: string }>
  hint?: string
  className?: string
}) {
  return (
    <Card className={className}>
      <CardContent className="flex items-center gap-4 p-5">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-primary-50 text-primary-700 dark:bg-primary-800/40 dark:text-primary-100">
          <Icon className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <p className="text-2xl font-bold leading-tight tabular-nums">{value}</p>
          <p className="truncate text-sm text-muted-foreground">{label}</p>
          {hint && <p className="truncate text-xs text-muted-foreground">{hint}</p>}
        </div>
      </CardContent>
    </Card>
  )
}
