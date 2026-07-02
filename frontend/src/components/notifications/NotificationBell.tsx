// Domain: Notifications
// Description: Navbar bell — unread badge polled every 30s, dropdown with the
//   most recent notifications (fetched on open). Clicking one marks it read and
//   deep-links via notificationHref; footer links to the full page.
'use client'

import * as React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { formatDistanceToNow } from 'date-fns'
import { uz as uzDate } from 'date-fns/locale'
import { Bell } from 'lucide-react'
import { notificationAPI } from '@/lib/api/notifications'
import { useI18n } from '@/lib/i18n/I18nProvider'
import { cn } from '@/lib/utils/cn'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { notificationHref } from './link'
import type { Notification } from '@/types'

const RECENT_LIMIT = 6

export function NotificationBell() {
  const router = useRouter()
  const queryClient = useQueryClient()
  const { t, locale } = useI18n()
  const [open, setOpen] = React.useState(false)

  const unreadQuery = useQuery({
    queryKey: ['notifications', 'unread-count'],
    queryFn: notificationAPI.unreadCount,
    refetchInterval: 30_000,
  })
  const unread = unreadQuery.data?.unread ?? 0

  const recentQuery = useQuery({
    queryKey: ['notifications', 'recent'],
    queryFn: () => notificationAPI.list(),
    enabled: open,
  })
  const recent = (recentQuery.data?.data ?? []).slice(0, RECENT_LIMIT)

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['notifications'] })

  const markRead = useMutation({
    mutationFn: (id: string) => notificationAPI.markRead(id),
    onSettled: invalidate,
  })

  const markAllRead = useMutation({
    mutationFn: notificationAPI.markAllRead,
    onSettled: invalidate,
  })

  const openNotification = (notification: Notification) => {
    if (!notification.isRead) markRead.mutate(notification.id)
    const href = notificationHref(notification)
    if (href) router.push(href)
  }

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label={
            unread > 0 ? t('notifications.unreadBadgeAria', { count: unread }) : t('notifications.bellAria')
          }
          className="relative"
        >
          <Bell className="h-5 w-5" />
          {unread > 0 && (
            <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-error px-1 text-[10px] font-semibold leading-none text-white">
              {unread > 9 ? '9+' : unread}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-80">
        <div className="flex items-center justify-between gap-2 pr-1">
          <DropdownMenuLabel>{t('notifications.title')}</DropdownMenuLabel>
          {unread > 0 && (
            <button
              className="text-xs font-medium text-primary hover:underline"
              onClick={() => markAllRead.mutate()}
            >
              {t('notifications.markAllRead')}
            </button>
          )}
        </div>
        <DropdownMenuSeparator />

        {recentQuery.isLoading && (
          <div className="space-y-2 p-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-9 animate-pulse rounded bg-muted" />
            ))}
          </div>
        )}

        {recentQuery.isError && (
          <p className="px-2 py-4 text-center text-sm text-muted-foreground">
            {t('notifications.loadFailed')}
          </p>
        )}

        {recentQuery.isSuccess && recent.length === 0 && (
          <p className="px-2 py-4 text-center text-sm text-muted-foreground">
            {t('notifications.empty')}
          </p>
        )}

        {recent.map((notification) => (
          <DropdownMenuItem
            key={notification.id}
            className="items-start"
            onSelect={() => openNotification(notification)}
          >
            <span
              className={cn(
                'mt-1.5 h-2 w-2 shrink-0 rounded-full',
                notification.isRead ? 'bg-transparent' : 'bg-primary'
              )}
            />
            <span className="min-w-0 flex-1">
              <span
                className={cn(
                  'block truncate text-sm',
                  !notification.isRead && 'font-medium'
                )}
              >
                {notification.title}
              </span>
              <span className="block text-xs text-muted-foreground">
                {formatDistanceToNow(new Date(notification.createdAt), {
                  addSuffix: true,
                  locale: locale === 'uz' ? uzDate : undefined,
                })}
              </span>
            </span>
          </DropdownMenuItem>
        ))}

        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/notifications" className="justify-center font-medium text-primary">
            {t('notifications.viewAll')}
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
