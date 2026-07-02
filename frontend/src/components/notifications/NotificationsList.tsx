// Domain: Notifications
// Description: Full notifications page body — cursor-paginated list, unread
//   highlighting, mark-one-read on open (with deep link), mark-all-read.
'use client'

import * as React from 'react'
import Link from 'next/link'
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import { formatDistanceToNow } from 'date-fns'
import { uz as uzDate } from 'date-fns/locale'
import { BellOff, CalendarClock, CheckCheck, ClipboardList, GraduationCap, Info, Megaphone } from 'lucide-react'
import { notificationAPI } from '@/lib/api/notifications'
import { cursorFromUrl } from '@/lib/api/client'
import { useI18n } from '@/lib/i18n/I18nProvider'
import { cn } from '@/lib/utils/cn'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { notificationHref } from './link'
import { notificationText } from './render'
import type { Locale } from '@/lib/i18n/config'
import type { Notification, NotificationType } from '@/types'

const TYPE_ICON: Record<NotificationType, React.ComponentType<{ className?: string }>> = {
  exam_graded: GraduationCap,
  exam_scheduled: CalendarClock,
  homework_assigned: ClipboardList,
  homework_due: ClipboardList,
  announcement: Megaphone,
  system: Info,
}

function relativeTime(iso: string, locale: Locale) {
  try {
    return formatDistanceToNow(new Date(iso), {
      addSuffix: true,
      locale: locale === 'uz' ? uzDate : undefined,
    })
  } catch {
    return ''
  }
}

function NotificationRow({
  notification,
  onOpen,
}: {
  notification: Notification
  onOpen: (n: Notification) => void
}) {
  const { t, locale } = useI18n()
  const Icon = TYPE_ICON[notification.type] ?? Info
  const href = notificationHref(notification)
  const { title, body } = notificationText(notification, t, locale)

  const inner = (
    <>
      <span
        className={cn(
          'flex h-9 w-9 shrink-0 items-center justify-center rounded-full',
          notification.isRead
            ? 'bg-muted text-muted-foreground'
            : 'bg-primary-100 text-primary-700 dark:bg-primary-800/50 dark:text-primary-100'
        )}
      >
        <Icon className="h-4 w-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className={cn('block text-sm', !notification.isRead && 'font-semibold')}>
          {title}
        </span>
        {body && (
          <span className="block truncate text-sm text-muted-foreground">{body}</span>
        )}
        <span className="block text-xs text-muted-foreground">
          {relativeTime(notification.createdAt, locale)}
        </span>
      </span>
      {!notification.isRead && <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-primary" />}
    </>
  )

  const className = cn(
    'flex w-full items-start gap-3 px-5 py-4 text-left transition-colors hover:bg-muted/60',
    !notification.isRead && 'bg-primary-50/60 dark:bg-primary-800/20'
  )

  if (href) {
    return (
      <Link href={href} className={className} onClick={() => onOpen(notification)}>
        {inner}
      </Link>
    )
  }
  return (
    <button type="button" className={className} onClick={() => onOpen(notification)}>
      {inner}
    </button>
  )
}

export function NotificationsList() {
  const { t } = useI18n()
  const queryClient = useQueryClient()
  const [unreadOnly, setUnreadOnly] = React.useState(false)

  const query = useInfiniteQuery({
    queryKey: ['notifications', 'list', { unreadOnly }],
    queryFn: ({ pageParam }) =>
      notificationAPI.list({ unread: unreadOnly || undefined, cursor: pageParam }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => cursorFromUrl(lastPage.pagination?.next ?? null) ?? undefined,
  })

  const unreadQuery = useQuery({
    queryKey: ['notifications', 'unread-count'],
    queryFn: notificationAPI.unreadCount,
  })

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['notifications'] })

  const markRead = useMutation({
    mutationFn: (id: string) => notificationAPI.markRead(id),
    onSettled: invalidate,
  })

  const markAllRead = useMutation({
    mutationFn: notificationAPI.markAllRead,
    onSettled: invalidate,
  })

  const items = query.data?.pages.flatMap((p) => p.data) ?? []
  const unread = unreadQuery.data?.unread ?? 0

  // Link rows navigate on their own; no-link rows just mark as read.
  const onOpen = (notification: Notification) => {
    if (!notification.isRead) markRead.mutate(notification.id)
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex gap-1 rounded-lg bg-muted p-1" role="group">
          <Button
            size="sm"
            variant={unreadOnly ? 'ghost' : 'default'}
            aria-pressed={!unreadOnly}
            onClick={() => setUnreadOnly(false)}
          >
            {t('notifications.filterAll')}
          </Button>
          <Button
            size="sm"
            variant={unreadOnly ? 'default' : 'ghost'}
            aria-pressed={unreadOnly}
            onClick={() => setUnreadOnly(true)}
          >
            {t('notifications.filterUnread')}
          </Button>
        </div>
        <Button
          variant="outline"
          size="sm"
          disabled={unread === 0}
          loading={markAllRead.isPending}
          onClick={() => markAllRead.mutate()}
        >
          <CheckCheck className="h-4 w-4" /> {t('notifications.markAllRead')}
        </Button>
      </div>

      {query.isLoading && (
        <Card>
          <CardContent className="space-y-3 p-5">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-12 animate-pulse rounded bg-muted" />
            ))}
          </CardContent>
        </Card>
      )}

      {query.isError && (
        <Card>
          <CardContent className="p-5 text-sm text-muted-foreground">
            {t('notifications.loadFailed')}
          </CardContent>
        </Card>
      )}

      {query.isSuccess && items.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 p-10 text-center">
            <BellOff className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">{t('notifications.empty')}</p>
          </CardContent>
        </Card>
      )}

      {items.length > 0 && (
        <>
          <Card>
            <div className="divide-y divide-border">
              {items.map((notification) => (
                <NotificationRow
                  key={notification.id}
                  notification={notification}
                  onOpen={onOpen}
                />
              ))}
            </div>
          </Card>

          <div className="flex justify-center">
            {query.hasNextPage ? (
              <Button
                variant="outline"
                loading={query.isFetchingNextPage}
                onClick={() => query.fetchNextPage()}
              >
                {t('notifications.loadMore')}
              </Button>
            ) : (
              <p className="text-sm text-muted-foreground">{t('notifications.allCaughtUp')}</p>
            )}
          </div>
        </>
      )}
    </div>
  )
}
