// Domain: Academy (teacher)
// Description: All students across the teacher's classes — a cursor-paginated,
//   searchable table with a per-student risk badge + headline metrics. Built to
//   scale as the student body grows (the dashboard only previews the at-risk few).
'use client'

import * as React from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { useInfiniteQuery } from '@tanstack/react-query'
import { Search, Users } from 'lucide-react'
import { teacherAPI, type StudentsListParams } from '@/lib/api/teacher'
import { cursorFromUrl } from '@/lib/api/client'
import { useI18n } from '@/lib/i18n/I18nProvider'
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
import { pct } from '@/lib/utils/num'
import type { RiskLevel } from '@/types'
import { RiskBadge } from './RiskBadge'

type RiskFilter = 'all' | 'attention' | 'ontrack'
const RISK_FILTERS: RiskFilter[] = ['all', 'attention', 'ontrack']
const MATCHES: Record<RiskFilter, (l: RiskLevel) => boolean> = {
  all: () => true,
  attention: (l) => l !== 'green',
  ontrack: (l) => l === 'green',
}

export function StudentsView() {
  const { t } = useI18n()
  const searchParams = useSearchParams()
  const initialRisk = searchParams.get('risk') as RiskFilter | null

  const [search, setSearch] = React.useState('')
  const [searchQ, setSearchQ] = React.useState('')
  const [risk, setRisk] = React.useState<RiskFilter>(
    initialRisk && RISK_FILTERS.includes(initialRisk) ? initialRisk : 'all'
  )

  React.useEffect(() => {
    const id = setTimeout(() => setSearchQ(search.trim()), 300)
    return () => clearTimeout(id)
  }, [search])

  const params: StudentsListParams = { search: searchQ || undefined }
  const query = useInfiniteQuery({
    queryKey: ['teacher', 'students', params],
    queryFn: ({ pageParam }) => teacherAPI.students({ ...params, cursor: pageParam }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => cursorFromUrl(last.pagination?.next ?? null) ?? undefined,
  })
  const rows = (query.data?.pages.flatMap((p) => p.data) ?? []).filter((r) =>
    MATCHES[risk](r.risk.level)
  )

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t('teacher.students.title')}</h1>
        <p className="text-muted-foreground">{t('teacher.students.subtitle')}</p>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('teacher.students.searchPlaceholder')}
            aria-label={t('teacher.students.searchPlaceholder')}
            className="pl-9"
          />
        </div>
        <Select value={risk} onValueChange={(v) => setRisk(v as RiskFilter)}>
          <SelectTrigger className="sm:w-48" aria-label={t('teacher.overview.status')}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('teacher.students.filterAll')}</SelectItem>
            <SelectItem value="attention">{t('teacher.students.filterAttention')}</SelectItem>
            <SelectItem value="ontrack">{t('teacher.students.filterOnTrack')}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {query.isLoading && (
        <Card>
          <CardContent className="space-y-3 p-5">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-10 animate-pulse rounded bg-muted" />
            ))}
          </CardContent>
        </Card>
      )}

      {query.isError && (
        <Card>
          <CardContent className="flex flex-wrap items-center justify-between gap-3 p-5 text-sm text-muted-foreground">
            {t('teacher.students.loadFailed')}
            <Button variant="outline" size="sm" onClick={() => query.refetch()}>
              {t('common.tryAgain')}
            </Button>
          </CardContent>
        </Card>
      )}

      {query.data && rows.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 p-10 text-center">
            <Users className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">{t('teacher.students.empty')}</p>
          </CardContent>
        </Card>
      )}

      {rows.length > 0 && (
        <Card>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('teacher.roster.student')}</TableHead>
                  <TableHead>{t('teacher.overview.status')}</TableHead>
                  <TableHead>{t('teacher.overview.accuracy')}</TableHead>
                  <TableHead>{t('teacher.insights.homework.title')}</TableHead>
                  <TableHead>{t('teacher.students.lastActive')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.student.id}>
                    <TableCell className="font-medium">
                      <Link
                        href={`/teacher/students/${r.student.id}?from=students`}
                        className="text-primary hover:underline"
                      >
                        {r.student.fullName || r.student.email}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <RiskBadge level={r.risk.level} />
                    </TableCell>
                    <TableCell className="tabular-nums text-muted-foreground">
                      {r.overallAccuracy !== null ? pct(r.overallAccuracy) : '—'}
                    </TableCell>
                    <TableCell className="tabular-nums text-muted-foreground">
                      {r.homeworkCompletionPct !== null ? pct(r.homeworkCompletionPct) : '—'}
                    </TableCell>
                    <TableCell className="tabular-nums text-muted-foreground">
                      {r.daysInactive === null
                        ? '—'
                        : t('teacher.students.daysAgo', { n: r.daysInactive })}
                    </TableCell>
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
            {t('teacher.common.loadMore')}
          </Button>
        </div>
      )}
    </div>
  )
}
