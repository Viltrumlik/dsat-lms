// Domain: Admin (course system)
// Description: Course directory — status filter + search, create dialog, and a
//   table linking to the per-course builder. Row actions: publish/archive, delete.
'use client'

import * as React from 'react'
import Link from 'next/link'
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { MoreHorizontal, Plus, Search, Trash2 } from 'lucide-react'
import {
  adminCoursesAPI,
  type CourseListParams,
  type CourseWritePayload,
} from '@/lib/api/admin/courses'
import { cursorFromUrl } from '@/lib/api/client'
import { parseApiError } from '@/lib/api/errors'
import { useI18n } from '@/lib/i18n/I18nProvider'
import { useToast } from '@/components/ui/toast'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import type { CourseStatus, CourseSubject } from '@/types'

const SUBJECTS: CourseSubject[] = ['math', 'reading_writing', 'general']
const STATUSES: CourseStatus[] = ['draft', 'published', 'archived']

const STATUS_VARIANT: Record<CourseStatus, 'secondary' | 'success' | 'outline'> = {
  draft: 'secondary',
  published: 'success',
  archived: 'outline',
}

function CreateCourseDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
}) {
  const { t } = useI18n()
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const [form, setForm] = React.useState<CourseWritePayload>({
    title: '',
    description: '',
    subject: 'general',
  })

  React.useEffect(() => {
    if (open) setForm({ title: '', description: '', subject: 'general' })
  }, [open])

  const create = useMutation({
    mutationFn: () => adminCoursesAPI.create(form),
    onSuccess: () => {
      onOpenChange(false)
      queryClient.invalidateQueries({ queryKey: ['admin', 'courses'] })
      toast({ variant: 'success', title: t('admin.courses.created') })
    },
    onError: (err) =>
      toast({
        variant: 'error',
        title: t('admin.courses.createFailed'),
        description: parseApiError(err).message,
      }),
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('admin.courses.createTitle')}</DialogTitle>
          <DialogDescription>{t('admin.courses.createDesc')}</DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault()
            if (form.title.trim()) create.mutate()
          }}
        >
          <div className="space-y-2">
            <Label htmlFor="co-title">{t('admin.courses.courseTitle')}</Label>
            <Input
              id="co-title"
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              autoFocus
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="co-subject">{t('admin.courses.subject')}</Label>
            <Select
              value={form.subject}
              onValueChange={(v) => setForm((f) => ({ ...f, subject: v as CourseSubject }))}
            >
              <SelectTrigger id="co-subject">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SUBJECTS.map((s) => (
                  <SelectItem key={s} value={s}>
                    {t(`admin.courses.subjectLabel.${s}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="co-desc">{t('admin.courses.description')}</Label>
            <Input
              id="co-desc"
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {t('admin.common.cancel')}
            </Button>
            <Button type="submit" loading={create.isPending} disabled={!form.title.trim()}>
              {t('admin.courses.create')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export function CoursesView() {
  const { t } = useI18n()
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const [search, setSearch] = React.useState('')
  const [searchQ, setSearchQ] = React.useState('')
  const [statusFilter, setStatusFilter] = React.useState<CourseStatus | 'all'>('all')
  const [createOpen, setCreateOpen] = React.useState(false)

  React.useEffect(() => {
    const id = setTimeout(() => setSearchQ(search.trim()), 300)
    return () => clearTimeout(id)
  }, [search])

  const params: CourseListParams = {
    status: statusFilter === 'all' ? undefined : statusFilter,
    search: searchQ || undefined,
  }
  const query = useInfiniteQuery({
    queryKey: ['admin', 'courses', params],
    queryFn: ({ pageParam }) => adminCoursesAPI.list({ ...params, cursor: pageParam }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => cursorFromUrl(last.pagination?.next ?? null) ?? undefined,
  })
  const courses = query.data?.pages.flatMap((p) => p.data) ?? []

  const remove = useMutation({
    mutationFn: (id: string) => adminCoursesAPI.remove(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'courses'] })
      toast({ variant: 'success', title: t('admin.courses.deleted') })
    },
    onError: (err) =>
      toast({
        variant: 'error',
        title: t('admin.courses.actionFailed'),
        description: parseApiError(err).message,
      }),
  })

  const publish = useMutation({
    mutationFn: ({ id, action }: { id: string; action: 'publish' | 'archive' }) =>
      adminCoursesAPI.publish(id, action),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'courses'] })
      toast({ variant: 'success', title: t('admin.courses.updated') })
    },
    onError: (err) =>
      toast({
        variant: 'error',
        title: t('admin.courses.actionFailed'),
        description: parseApiError(err).message,
      }),
  })

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('admin.courses.searchPlaceholder')}
            aria-label={t('admin.courses.searchPlaceholder')}
            className="pl-9"
          />
        </div>
        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as CourseStatus | 'all')}>
          <SelectTrigger className="sm:w-44" aria-label={t('admin.courses.status')}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('admin.courses.allStatuses')}</SelectItem>
            {STATUSES.map((s) => (
              <SelectItem key={s} value={s}>
                {t(`admin.courses.statusLabel.${s}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4" /> {t('admin.courses.newCourse')}
        </Button>
      </div>

      {query.isLoading && (
        <Card>
          <CardContent className="space-y-3 p-5">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-10 animate-pulse rounded bg-muted" />
            ))}
          </CardContent>
        </Card>
      )}

      {query.isError && (
        <Card>
          <CardContent className="flex flex-wrap items-center justify-between gap-3 p-5 text-sm text-muted-foreground">
            {t('admin.courses.loadFailed')}
            <Button variant="outline" size="sm" onClick={() => query.refetch()}>
              {t('common.tryAgain')}
            </Button>
          </CardContent>
        </Card>
      )}

      {query.data && courses.length === 0 && (
        <Card>
          <CardContent className="p-10 text-center text-sm text-muted-foreground">
            {t('admin.courses.empty')}
          </CardContent>
        </Card>
      )}

      {query.data && courses.length > 0 && (
        <Card>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('admin.courses.course')}</TableHead>
                  <TableHead>{t('admin.courses.subject')}</TableHead>
                  <TableHead>{t('admin.courses.units')}</TableHead>
                  <TableHead>{t('admin.courses.lessons')}</TableHead>
                  <TableHead>{t('admin.courses.status')}</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {courses.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="font-medium">
                      <Link href={`/admin/courses/${c.id}`} className="text-primary hover:underline">
                        {c.title}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">{t(`admin.courses.subjectLabel.${c.subject}`)}</Badge>
                    </TableCell>
                    <TableCell className="tabular-nums">{c.unitCount}</TableCell>
                    <TableCell className="tabular-nums">{c.lessonCount}</TableCell>
                    <TableCell>
                      <Badge variant={STATUS_VARIANT[c.status]}>
                        {t(`admin.courses.statusLabel.${c.status}`)}
                      </Badge>
                    </TableCell>
                    <TableCell className="w-10 text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" aria-label={t('admin.courses.actions')}>
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem asChild>
                            <Link href={`/admin/courses/${c.id}`}>{t('admin.courses.openBuilder')}</Link>
                          </DropdownMenuItem>
                          {c.status !== 'published' && (
                            <DropdownMenuItem
                              onSelect={() => publish.mutate({ id: c.id, action: 'publish' })}
                            >
                              {t('admin.courses.publish')}
                            </DropdownMenuItem>
                          )}
                          {c.status === 'published' && (
                            <DropdownMenuItem
                              onSelect={() => publish.mutate({ id: c.id, action: 'archive' })}
                            >
                              {t('admin.courses.archive')}
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuItem
                            className="text-error data-[highlighted]:text-error"
                            onSelect={() => remove.mutate(c.id)}
                          >
                            <Trash2 className="h-4 w-4" /> {t('admin.courses.delete')}
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
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
            {t('admin.courses.loadMore')}
          </Button>
        </div>
      )}

      <CreateCourseDialog open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  )
}
