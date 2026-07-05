// Domain: Support
// Description: A student's support usage at a glance (shown on the Support
//   landing). Hidden when the student has no support activity yet.
'use client'

import { useQuery } from '@tanstack/react-query'
import { supportAnalyticsAPI } from '@/lib/api/support-analytics'
import { useT } from '@/lib/i18n/I18nProvider'
import { Card, CardContent } from '@/components/ui/card'

export function SupportSummaryStrip() {
  const t = useT()
  const { data } = useQuery({
    queryKey: ['support', 'my-summary'],
    queryFn: supportAnalyticsAPI.studentSummary,
  })

  if (!data || (data.sessions.total === 0 && data.tickets.total === 0)) return null

  const items = [
    { label: t('support.summary.sessionsCompleted'), value: data.sessions.completed },
    { label: t('support.summary.upcoming'), value: data.sessions.upcoming },
    { label: t('support.summary.questionsAsked'), value: data.tickets.total },
    { label: t('support.summary.questionsAnswered'), value: data.tickets.answered },
  ]

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {items.map((item) => (
        <Card key={item.label}>
          <CardContent className="p-4">
            <p className="text-2xl font-bold tabular-nums">{item.value}</p>
            <p className="text-xs text-muted-foreground">{item.label}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
