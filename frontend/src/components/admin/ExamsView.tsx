// Domain: Admin (exam builder)
// Description: Exam-template directory — type filter + search, create dialog, and a
//   table linking to the per-exam builder. Row action: delete (soft).
'use client'

import * as React from 'react'
import Link from 'next/link'
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { MoreHorizontal, Plus, Search, Trash2 } from 'lucide-react'
import { adminExamsAPI, type ExamListParams, type ExamWritePayload } from '@/lib/api/admin/exams'
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import type { AccessLevel, ExamModule, ExamType } from '@/types'

const TYPES: ExamType[] = ['practice', 'past_paper', 'mock', 'midterm', 'assessment', 'homework']
const EXAM_MODULES: ExamModule[] = ['full', 'math', 'reading_writing']

function CreateExamDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { t } = useI18n()
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const [form, setForm] = React.useState<ExamWritePayload>({
    type: 'practice',
    title: '',
    module: 'full',
    accessLevel: 'academy',
    timeLimit: null,
  })

  React.useEffect(() => {
    if (open)
      setForm({ type: 'practice', title: '', module: 'full', accessLevel: 'academy', timeLimit: null })
  }, [open])

  const create = useMutation({
    mutationFn: () => adminExamsAPI.create(form),
    onSuccess: () => {
      onOpenChange(false)
      queryClient.invalidateQueries({ queryKey: ['admin', 'exams'] })
      toast({ variant: 'success', title: t('admin.exams.created') })
    },
    onError: (err) =>
      toast({ variant: 'error', title: t('admin.exams.createFailed'), description: parseApiError(err).message }),
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('admin.exams.createTitle')}</DialogTitle>
          <DialogDescription>{t('admin.exams.createDesc')}</DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault()
            if (form.title.trim()) create.mutate()
          }}
        >
          <div className="space-y-2">
            <Label htmlFor="ex-title">{t('admin.exams.exam')}</Label>
            <Input
              id="ex-title"
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              autoFocus
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="ex-type">{t('admin.exams.type')}</Label>
              <Select value={form.type} onValueChange={(v) => setForm((f) => ({ ...f, type: v as ExamType }))}>
                <SelectTrigger id="ex-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TYPES.map((ty) => (
                    <SelectItem key={ty} value={ty}>
                      {t(`admin.exams.typeLabel.${ty}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="ex-module">{t('admin.exams.module')}</Label>
              <Select value={form.module} onValueChange={(v) => setForm((f) => ({ ...f, module: v as ExamModule }))}>
                <SelectTrigger id="ex-module">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {EXAM_MODULES.map((m) => (
                    <SelectItem key={m} value={m}>
                      {t(`modules.${m}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="ex-time">{t('admin.exams.timeLimit')}</Label>
              <Input
                id="ex-time"
                type="number"
                min={0}
                value={form.timeLimit ?? ''}
                onChange={(e) =>
                  setForm((f) => ({ ...f, timeLimit: e.target.value ? Number(e.target.value) : null }))
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="ex-access">{t('admin.exams.access')}</Label>
              <Select
                value={form.accessLevel}
                onValueChange={(v) => setForm((f) => ({ ...f, accessLevel: v as AccessLevel }))}
              >
                <SelectTrigger id="ex-access">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="public">{t('admin.exams.accessPublic')}</SelectItem>
                  <SelectItem value="academy">{t('admin.exams.accessAcademy')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {t('admin.common.cancel')}
            </Button>
            <Button type="submit" loading={create.isPending} disabled={!form.title.trim()}>
              {t('admin.exams.create')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export function ExamsView() {
  const { t } = useI18n()
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const [search, setSearch] = React.useState('')
  const [searchQ, setSearchQ] = React.useState('')
  const [typeFilter, setTypeFilter] = React.useState<ExamType | 'all'>('all')
  const [createOpen, setCreateOpen] = React.useState(false)

  React.useEffect(() => {
    const id = setTimeout(() => setSearchQ(search.trim()), 300)
    return () => clearTimeout(id)
  }, [search])

  const params: ExamListParams = {
    type: typeFilter === 'all' ? undefined : typeFilter,
    search: searchQ || undefined,
  }
  const query = useInfiniteQuery({
    queryKey: ['admin', 'exams', params],
    queryFn: ({ pageParam }) => adminExamsAPI.list({ ...params, cursor: pageParam }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => cursorFromUrl(last.pagination?.next ?? null) ?? undefined,
  })
  const exams = query.data?.pages.flatMap((p) => p.data) ?? []

  const remove = useMutation({
    mutationFn: (id: string) => adminExamsAPI.remove(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'exams'] })
      toast({ variant: 'success', title: t('admin.exams.deleted') })
    },
    onError: (err) =>
      toast({ variant: 'error', title: t('admin.exams.actionFailed'), description: parseApiError(err).message }),
  })

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('admin.exams.searchPlaceholder')}
            aria-label={t('admin.exams.searchPlaceholder')}
            className="pl-9"
          />
        </div>
        <Select value={typeFilter} onValueChange={(v) => setTypeFilter(v as ExamType | 'all')}>
          <SelectTrigger className="sm:w-44" aria-label={t('admin.exams.type')}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('admin.exams.allTypes')}</SelectItem>
            {TYPES.map((ty) => (
              <SelectItem key={ty} value={ty}>
                {t(`admin.exams.typeLabel.${ty}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4" /> {t('admin.exams.newExam')}
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
            {t('admin.exams.loadFailed')}
            <Button variant="outline" size="sm" onClick={() => query.refetch()}>
              {t('common.tryAgain')}
            </Button>
          </CardContent>
        </Card>
      )}

      {query.data && exams.length === 0 && (
        <Card>
          <CardContent className="p-10 text-center text-sm text-muted-foreground">
            {t('admin.exams.empty')}
          </CardContent>
        </Card>
      )}

      {query.data && exams.length > 0 && (
        <Card>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('admin.exams.exam')}</TableHead>
                  <TableHead>{t('admin.exams.type')}</TableHead>
                  <TableHead>{t('admin.exams.sections')}</TableHead>
                  <TableHead>{t('admin.exams.questions')}</TableHead>
                  <TableHead>{t('admin.exams.access')}</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {exams.map((ex) => (
                  <TableRow key={ex.id}>
                    <TableCell className="font-medium">
                      <Link href={`/admin/exams/${ex.id}`} className="text-primary hover:underline">
                        {ex.title}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">{t(`admin.exams.typeLabel.${ex.type}`)}</Badge>
                    </TableCell>
                    <TableCell className="tabular-nums">{ex.sectionCount}</TableCell>
                    <TableCell className="tabular-nums">{ex.questionCount}</TableCell>
                    <TableCell>
                      <Badge variant={ex.accessLevel === 'public' ? 'success' : 'outline'}>
                        {t(ex.accessLevel === 'public' ? 'admin.exams.accessPublic' : 'admin.exams.accessAcademy')}
                      </Badge>
                    </TableCell>
                    <TableCell className="w-10 text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" aria-label={t('admin.exams.actions')}>
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem asChild>
                            <Link href={`/admin/exams/${ex.id}`}>{t('admin.exams.openBuilder')}</Link>
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            className="text-error data-[highlighted]:text-error"
                            onSelect={() => remove.mutate(ex.id)}
                          >
                            <Trash2 className="h-4 w-4" /> {t('admin.exams.delete')}
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
          <Button variant="outline" loading={query.isFetchingNextPage} onClick={() => query.fetchNextPage()}>
            {t('admin.exams.loadMore')}
          </Button>
        </div>
      )}

      <CreateExamDialog open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  )
}
