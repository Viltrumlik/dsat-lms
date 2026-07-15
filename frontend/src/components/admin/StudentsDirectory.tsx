// Domain: Admin (CRM)
// Description: A CRM student directory (distinct from /admin/users) — filter by
//   status / tag / search, multi-select rows for bulk tag / status actions, and
//   save/apply per-user filter views. Rows link to the Student-360.
'use client'

import * as React from 'react'
import Link from 'next/link'
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Bookmark, Search } from 'lucide-react'
import {
  adminStudentsAPI,
  type BulkPayload,
  type StudentDirParams,
} from '@/lib/api/admin/students'
import { crmTagsAPI } from '@/lib/api/admin/crm'
import { cursorFromUrl } from '@/lib/api/client'
import { parseApiError } from '@/lib/api/errors'
import { useI18n } from '@/lib/i18n/I18nProvider'
import { useToast } from '@/components/ui/toast'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'

const STATUSES = ['active', 'frozen', 'graduated', 'dropped']
const ALL = '__all__'

export function StudentsDirectory() {
  const { t } = useI18n()
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const [search, setSearch] = React.useState('')
  const [searchQ, setSearchQ] = React.useState('')
  const [status, setStatus] = React.useState<string>(ALL)
  const [tag, setTag] = React.useState<string>(ALL)
  const [selected, setSelected] = React.useState<Set<string>>(new Set())
  const [saveOpen, setSaveOpen] = React.useState(false)
  const [saveName, setSaveName] = React.useState('')

  React.useEffect(() => {
    const id = setTimeout(() => setSearchQ(search.trim()), 300)
    return () => clearTimeout(id)
  }, [search])

  const params: StudentDirParams = {
    q: searchQ || undefined,
    status: status === ALL ? undefined : status,
    tag: tag === ALL ? undefined : tag,
  }
  const query = useInfiniteQuery({
    queryKey: ['admin', 'students-dir', params],
    queryFn: ({ pageParam }) => adminStudentsAPI.list({ ...params, cursor: pageParam }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => cursorFromUrl(last.pagination?.next ?? null) ?? undefined,
  })
  const rows = query.data?.pages.flatMap((p) => p.data) ?? []

  const tags = useQuery({ queryKey: ['admin', 'crm-tags'], queryFn: () => crmTagsAPI.list() })
  const savedFilters = useQuery({
    queryKey: ['admin', 'saved-filters', 'students'],
    queryFn: () => adminStudentsAPI.savedFilters('students'),
  })

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['admin', 'students-dir'] })
  const onError = (err: unknown) =>
    toast({ variant: 'error', title: t('admin.students.actionFailed'), description: parseApiError(err).message })

  const bulk = useMutation({
    mutationFn: (payload: BulkPayload) => adminStudentsAPI.bulk(payload),
    onSuccess: (res) => {
      setSelected(new Set())
      invalidate()
      toast({ variant: 'success', title: t('admin.students.bulkDone', { applied: res.applied, skipped: res.skipped }) })
    },
    onError,
  })

  const saveFilter = useMutation({
    mutationFn: () =>
      adminStudentsAPI.saveFilter(saveName.trim(), params as Record<string, string>, 'students'),
    onSuccess: () => {
      setSaveOpen(false)
      setSaveName('')
      queryClient.invalidateQueries({ queryKey: ['admin', 'saved-filters', 'students'] })
      toast({ variant: 'success', title: t('admin.students.filterSaved') })
    },
    onError,
  })

  const applySaved = (id: string) => {
    const sf = savedFilters.data?.find((f) => f.id === id)
    if (!sf) return
    setStatus(sf.params.status ?? ALL)
    setTag(sf.params.tag ?? ALL)
    setSearch(sf.params.q ?? '')
  }

  const selectedIds = [...selected]
  const toggleAll = (checked: boolean) =>
    setSelected(checked ? new Set(rows.map((r) => r.id)) : new Set())
  const toggleRow = (id: string, checked: boolean) =>
    setSelected((prev) => {
      const next = new Set(prev)
      if (checked) next.add(id)
      else next.delete(id)
      return next
    })

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('admin.students.search')}
            className="pl-9"
          />
        </div>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="sm:w-40" aria-label={t('admin.students.status')}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>{t('admin.students.allStatuses')}</SelectItem>
            {STATUSES.map((s) => (
              <SelectItem key={s} value={s}>
                {t(`admin.students.statusLabel.${s}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={tag} onValueChange={setTag}>
          <SelectTrigger className="sm:w-40" aria-label={t('admin.students.tag')}>
            <SelectValue placeholder={t('admin.students.tag')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>{t('admin.students.allTags')}</SelectItem>
            {(tags.data ?? []).map((tg) => (
              <SelectItem key={tg.id} value={tg.id}>
                {tg.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value="" onValueChange={applySaved}>
          <SelectTrigger className="sm:w-40" aria-label={t('admin.students.savedViews')}>
            <SelectValue placeholder={t('admin.students.savedViews')} />
          </SelectTrigger>
          <SelectContent>
            {(savedFilters.data ?? []).length === 0 ? (
              <SelectItem value="__none__" disabled>
                {t('admin.students.noSavedViews')}
              </SelectItem>
            ) : (
              savedFilters.data!.map((f) => (
                <SelectItem key={f.id} value={f.id}>
                  {f.name}
                </SelectItem>
              ))
            )}
          </SelectContent>
        </Select>
        <Button variant="outline" onClick={() => setSaveOpen(true)}>
          <Bookmark className="h-4 w-4" /> {t('admin.students.saveView')}
        </Button>
      </div>

      {/* Bulk bar */}
      {selectedIds.length > 0 && (
        <Card>
          <CardContent className="flex flex-wrap items-center gap-3 p-3 text-sm">
            <span className="font-medium">
              {t('admin.students.nSelected', { n: selectedIds.length })}
            </span>
            <Select
              value=""
              onValueChange={(tagId) => bulk.mutate({ studentIds: selectedIds, action: 'tag', tag: tagId })}
            >
              <SelectTrigger className="w-40">
                <SelectValue placeholder={t('admin.students.bulkTag')} />
              </SelectTrigger>
              <SelectContent>
                {(tags.data ?? []).map((tg) => (
                  <SelectItem key={tg.id} value={tg.id}>
                    {tg.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value=""
              onValueChange={(s) => bulk.mutate({ studentIds: selectedIds, action: 'status', status: s })}
            >
              <SelectTrigger className="w-40">
                <SelectValue placeholder={t('admin.students.bulkStatus')} />
              </SelectTrigger>
              <SelectContent>
                {STATUSES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {t(`admin.students.statusLabel.${s}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="ghost" size="sm" onClick={() => setSelected(new Set())}>
              {t('admin.students.clear')}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Table */}
      {query.isLoading && (
        <Card>
          <CardContent className="space-y-3 p-5">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-9 animate-pulse rounded bg-muted" />
            ))}
          </CardContent>
        </Card>
      )}
      {query.data && rows.length === 0 && (
        <Card>
          <CardContent className="p-10 text-center text-sm text-muted-foreground">
            {t('admin.students.empty')}
          </CardContent>
        </Card>
      )}
      {rows.length > 0 && (
        <Card>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8">
                    <Checkbox
                      checked={selectedIds.length === rows.length && rows.length > 0}
                      onCheckedChange={(v) => toggleAll(v === true)}
                      aria-label={t('admin.students.selectAll')}
                    />
                  </TableHead>
                  <TableHead>{t('admin.students.student')}</TableHead>
                  <TableHead>{t('admin.students.status')}</TableHead>
                  <TableHead>{t('admin.students.mentor')}</TableHead>
                  <TableHead>{t('admin.students.tags')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell>
                      <Checkbox
                        checked={selected.has(r.id)}
                        onCheckedChange={(v) => toggleRow(r.id, v === true)}
                        aria-label={r.fullName || r.email}
                      />
                    </TableCell>
                    <TableCell>
                      <Link href={`/admin/students/${r.id}`} className="font-medium text-primary hover:underline">
                        {r.fullName || r.email}
                      </Link>
                      <p className="text-xs text-muted-foreground">{r.email}</p>
                    </TableCell>
                    <TableCell>
                      {r.status && (
                        <Badge variant={r.status === 'active' ? 'success' : 'secondary'}>
                          {t(`admin.students.statusLabel.${r.status}`)}
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {r.mentor?.fullName ?? '—'}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {r.tags.map((tg) => (
                          <Badge key={tg.id} variant="outline">
                            {tg.name}
                          </Badge>
                        ))}
                      </div>
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
          <Button variant="outline" loading={query.isFetchingNextPage} onClick={() => query.fetchNextPage()}>
            {t('admin.students.loadMore')}
          </Button>
        </div>
      )}

      <Dialog open={saveOpen} onOpenChange={setSaveOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('admin.students.saveView')}</DialogTitle>
          </DialogHeader>
          <Input
            value={saveName}
            onChange={(e) => setSaveName(e.target.value)}
            placeholder={t('admin.students.viewName')}
            autoFocus
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setSaveOpen(false)}>
              {t('admin.common.cancel')}
            </Button>
            <Button loading={saveFilter.isPending} disabled={!saveName.trim()} onClick={() => saveFilter.mutate()}>
              {t('admin.students.save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
