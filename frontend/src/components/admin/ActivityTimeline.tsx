// Domain: Admin (CRM)
// Description: A student's unified activity feed — merges notes, parent-contact
//   logs, mentor check-ins, and audit events (newest first) from one endpoint.
'use client'

import { useQuery } from '@tanstack/react-query'
import { FileText, History, MessageSquare, Phone, UserCog } from 'lucide-react'
import { studentNotesAPI } from '@/lib/api/admin/crm'
import { useI18n } from '@/lib/i18n/I18nProvider'
import type { TimelineEvent, TimelineEventType } from '@/types'

const ICONS: Record<TimelineEventType, React.ComponentType<{ className?: string }>> = {
  note: FileText,
  parent_contact: Phone,
  mentor_checkin: MessageSquare,
  audit: History,
}

export function ActivityTimeline({ studentId }: { studentId: string }) {
  const { t } = useI18n()
  const query = useQuery({
    queryKey: ['admin', 'student-timeline', studentId],
    queryFn: () => studentNotesAPI.timeline(studentId),
  })
  const events = query.data ?? []

  if (query.isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-12 animate-pulse rounded bg-muted" />
        ))}
      </div>
    )
  }
  if (events.length === 0) {
    return <p className="text-sm text-muted-foreground">{t('admin.timeline.empty')}</p>
  }

  return (
    <ol className="space-y-3">
      {events.map((e: TimelineEvent) => {
        const Icon = ICONS[e.type] ?? UserCog
        return (
          <li key={`${e.type}-${e.id}`} className="flex gap-3">
            <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
              <Icon className="h-4 w-4" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm">
                <span className="font-medium">{t(`admin.timeline.type.${e.type}`)}</span>
                {e.summary ? ` — ${e.summary}` : ''}
              </p>
              <p className="text-xs text-muted-foreground">
                {new Date(e.timestamp).toLocaleString()}
                {e.actor ? ` · ${e.actor.fullName || e.actor.email}` : ''}
              </p>
            </div>
          </li>
        )
      })}
    </ol>
  )
}
