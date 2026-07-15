// Domain: Audit (admin)
// Description: The activity log viewer — searchable + action-filterable, cursor-
//   paginated table of who did what. Read-only. Backed by GET /admin/audit/.
'use client'

import * as React from 'react'
import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { format } from 'date-fns'
import { uz as uzDate } from 'date-fns/locale'
import { ScrollText, Search } from 'lucide-react'
import { adminAuditAPI, type AuditListParams } from '@/lib/api/admin/audit'
import { cursorFromUrl } from '@/lib/api/client'
import { useI18n } from '@/lib/i18n/I18nProvider'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

export function AuditLogView() {
  const { t, locale } = useI18n()
  const [search, setSearch] = React.useState('')
  const [searchQ, setSearchQ] = React.useState('')
  const [action, setAction] = React.useState<string>('all')

  React.useEffect(() => {
    const id = setTimeout(() => setSearchQ(search.trim()), 300)
    return () => clearTimeout(id)
  }, [search])

  const vocab = useQuery({ queryKey: ['admin', 'audit', 'actions'], queryFn: adminAuditAPI.actions })

  const listParams: AuditListParams = {
    action: action === 'all' ? undefined : action,
    q: searchQ || undefined,
  }

  const query = useInfiniteQuery({
    queryKey: ['admin', 'audit', listParams],
    queryFn: ({ pageParam }) => adminAuditAPI.list({ ...listParams, cursor: pageParam }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => cursorFromUrl(last.pagination?.next ?? null) ?? undefined,
  })

  const rows = query.data?.pages.flatMap((p) => p.data) ?? []

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t('admin.audit.title')}</h1>
        <p className="text-muted-foreground">{t('admin.audit.subtitle')}</p>
      </div>

      {/* Toolbar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('admin.audit.searchPlaceholder')}
            aria-label={t('admin.audit.searchPlaceholder')}
            className="pl-9"
          />
        </div>
        <Select value={action} onValueChange={setAction}>
          <SelectTrigger className="sm:w-56" aria-label={t('admin.audit.action')}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('admin.audit.allActions')}</SelectItem>
            {(vocab.data?.actions ?? []).map((a) => (
              <SelectItem key={a} value={a}>
                {a}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {query.isLoading && (
        <Card>
          <CardContent className="space-y-3 p-5">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-10 animate-pulse rounded bg-muted" />
            ))}
          </CardContent>
        </Card>
      )}

      {query.isError && (
        <Card>
          <CardContent className="flex flex-wrap items-center justify-between gap-3 p-5 text-sm text-muted-foreground">
            {t('admin.audit.loadFailed')}
            <Button variant="outline" size="sm" onClick={() => query.refetch()}>
              {t('common.tryAgain')}
            </Button>
          </CardContent>
        </Card>
      )}

      {query.data && rows.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 p-10 text-center">
            <ScrollText className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">{t('admin.audit.empty')}</p>
          </CardContent>
        </Card>
      )}

      {query.data && rows.length > 0 && (
        <Card>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('admin.audit.when')}</TableHead>
                  <TableHead>{t('admin.audit.actor')}</TableHead>
                  <TableHead>{t('admin.audit.action')}</TableHead>
                  <TableHead>{t('admin.audit.target')}</TableHead>
                  <TableHead>{t('admin.audit.summary')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="whitespace-nowrap text-muted-foreground">
                      {format(new Date(r.createdAt), 'PP p', {
                        locale: locale === 'uz' ? uzDate : undefined,
                      })}
                    </TableCell>
                    <TableCell>
                      <div className="font-medium">
                        {r.actorName || r.actorEmail || t('admin.audit.system')}
                      </div>
                      {r.actorRole && (
                        <div className="text-xs text-muted-foreground">{r.actorRole}</div>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary" className="font-mono text-xs">
                        {r.action}
                      </Badge>
                    </TableCell>
                    <TableCell className="max-w-xs truncate">{r.targetLabel || '—'}</TableCell>
                    <TableCell className="text-muted-foreground">{r.summary || '—'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </Card>
      )}

      {query.hasNextPage && (
        <div className="flex justify-center">
          <Button
            variant="outline"
            loading={query.isFetchingNextPage}
            onClick={() => query.fetchNextPage()}
          >
            {t('admin.audit.loadMore')}
          </Button>
        </div>
      )}
    </div>
  )
}
