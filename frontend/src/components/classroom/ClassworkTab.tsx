// Domain: Academy (classroom)
// Description: Everything set for this class, in one due-date-ordered list —
//   homework and materials together, because a student should not have to
//   remember which one a thing was posted as.
//
// A row leads where the role can act: a student to the homework they hand in, a
// teacher to the submissions they mark.
'use client'

import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import { format } from 'date-fns'
import { uz as uzDate } from 'date-fns/locale'
import { ClipboardList, FileText, Paperclip } from 'lucide-react'
import { classesAPI } from '@/lib/api/classes'
import { useI18n } from '@/lib/i18n/I18nProvider'
import { Badge, type BadgeProps } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Spinner } from '@/components/ui/spinner'
import type { ClassCapabilities, ClassworkItem, HomeworkStatus } from '@/types'

const STATUS_VARIANT: Record<HomeworkStatus, BadgeProps['variant']> = {
  assigned: 'secondary',
  submitted: 'success',
  returned: 'warning',
  graded: 'default',
}

function Row({
  item,
  capabilities,
}: {
  item: ClassworkItem
  capabilities: ClassCapabilities
}) {
  const { t, locale } = useI18n()
  const dateLocale = locale === 'uz' ? uzDate : undefined
  const Icon = item.kind === 'homework' ? ClipboardList : FileText

  const body = (
    <Card className="transition-colors hover:border-primary/50">
      <CardContent className="flex items-start gap-3 p-4">
        <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted">
          <Icon className="h-4 w-4 text-muted-foreground" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium">{item.title}</span>
            {!item.isPublished && (
              <Badge variant="outline">{t('classroom.classwork.draft')}</Badge>
            )}
            {item.myStatus && (
              <Badge variant={STATUS_VARIANT[item.myStatus]}>
                {t(`homework.status.${item.myStatus}`)}
              </Badge>
            )}
          </div>
          {item.description && (
            <p className="mt-0.5 line-clamp-2 text-sm text-muted-foreground">{item.description}</p>
          )}
          <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            {item.dueAt && (
              <span>
                {t('classroom.classwork.due')}{' '}
                {format(new Date(item.dueAt), 'd MMM, HH:mm', { locale: dateLocale })}
              </span>
            )}
            {item.examTitle && <span>· {item.examTitle}</span>}
            {item.attachmentCount > 0 && (
              <span className="flex items-center gap-1">
                <Paperclip className="h-3 w-3" /> {item.attachmentCount}
              </span>
            )}
          </p>
        </div>
        {capabilities.canSeeSubmissions && item.submittedCount !== null && (
          <span className="shrink-0 text-sm tabular-nums text-muted-foreground">
            {t('classroom.classwork.handedIn', { count: item.submittedCount })}
          </span>
        )}
      </CardContent>
    </Card>
  )

  if (item.kind !== 'homework') return body
  // Staff mark; students hand in. Same row, different destination.
  const href = capabilities.canGrade ? `/teacher/homework/${item.id}` : `/homework/${item.id}`
  return (
    <Link href={href} className="block rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
      {body}
    </Link>
  )
}

export function ClassworkTab({
  classId,
  capabilities,
}: {
  classId: string
  capabilities: ClassCapabilities
}) {
  const t = useI18n().t
  const query = useQuery({
    queryKey: ['class-classwork', classId],
    queryFn: () => classesAPI.classwork(classId),
  })

  if (query.isLoading) {
    return (
      <div className="flex justify-center py-12">
        <Spinner className="h-5 w-5" />
      </div>
    )
  }

  const items = query.data ?? []
  if (items.length === 0) {
    return (
      <Card>
        <CardContent className="p-10 text-center text-sm text-muted-foreground">
          {t('classroom.classwork.empty')}
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-3">
      {items.map((item) => (
        <Row key={`${item.kind}-${item.id}`} item={item} capabilities={capabilities} />
      ))}
    </div>
  )
}
