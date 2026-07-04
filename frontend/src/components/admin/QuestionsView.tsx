// Domain: Admin (content studio)
// Description: Question directory — status/module filters + search, cursor-paginated
//   table with the stem preview, difficulty, status badge, and row actions (edit,
//   submit-for-review, new-version, delete). The status=review filter is the review
//   queue; approve/reject happen in the editor.
'use client'

import * as React from 'react'
import Link from 'next/link'
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { MoreHorizontal, Pencil, Plus, Search, Send, Trash2, Copy } from 'lucide-react'
import { adminQuestionsAPI, type AdminQuestionListParams } from '@/lib/api/admin/questions'
import { cursorFromUrl } from '@/lib/api/client'
import { parseApiError } from '@/lib/api/errors'
import { useI18n } from '@/lib/i18n/I18nProvider'
import { useToast } from '@/components/ui/toast'
import { Badge, type BadgeProps } from '@/components/ui/badge'
import { Button, buttonVariants } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
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
import { DifficultyDots } from '@/components/question-bank/DifficultyDots'
import { MODULE_LABEL_KEY, moduleBadgeVariant } from '@/components/question-bank/labels'
import type { AdminQuestionListItem, QuestionModule, QuestionStatus } from '@/types'

const STATUSES: QuestionStatus[] = ['draft', 'review', 'published', 'archived']
const MODULES: QuestionModule[] = ['math', 'reading_writing']
const STATUS_BADGE: Record<QuestionStatus, BadgeProps['variant']> = {
  draft: 'secondary',
  review: 'warning',
  published: 'success',
  archived: 'outline',
}

export function QuestionsView() {
  const { t } = useI18n()
  const { toast } = useToast()
  const queryClient = useQueryClient()

  const [search, setSearch] = React.useState('')
  const [searchQ, setSearchQ] = React.useState('')
  const [status, setStatus] = React.useState<QuestionStatus | 'all'>('all')
  const [moduleFilter, setModuleFilter] = React.useState<QuestionModule | 'all'>('all')

  React.useEffect(() => {
    const id = setTimeout(() => setSearchQ(search.trim()), 300)
    return () => clearTimeout(id)
  }, [search])

  const params: AdminQuestionListParams = {
    status: status === 'all' ? undefined : status,
    module: moduleFilter === 'all' ? undefined : moduleFilter,
    search: searchQ || undefined,
  }

  const query = useInfiniteQuery({
    queryKey: ['admin', 'questions', params],
    queryFn: ({ pageParam }) => adminQuestionsAPI.list({ ...params, cursor: pageParam }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => cursorFromUrl(last.pagination?.next ?? null) ?? undefined,
  })
  const questions = query.data?.pages.flatMap((p) => p.data) ?? []

  const act = useMutation<unknown, unknown, { kind: 'submit' | 'newVersion' | 'remove'; q: AdminQuestionListItem }>({
    mutationFn: ({ kind, q }) => {
      if (kind === 'submit') return adminQuestionsAPI.submit(q.id)
      if (kind === 'newVersion') return adminQuestionsAPI.newVersion(q.id)
      return adminQuestionsAPI.remove(q.id)
    },
    onSuccess: (_res, { kind }) => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'questions'] })
      toast({ variant: 'success', title: t(`admin.questions.${kind}Done`) })
    },
    onError: (err) =>
      toast({ variant: 'error', title: t('admin.questions.actionFailed'), description: parseApiError(err).message }),
  })

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('admin.questions.searchPlaceholder')}
            aria-label={t('admin.questions.searchPlaceholder')}
            className="pl-9"
          />
        </div>
        <Select value={status} onValueChange={(v) => setStatus(v as QuestionStatus | 'all')}>
          <SelectTrigger className="sm:w-40" aria-label={t('admin.questions.status')}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('admin.questions.allStatuses')}</SelectItem>
            {STATUSES.map((s) => (
              <SelectItem key={s} value={s}>
                {t(`admin.questions.statusLabel.${s}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={moduleFilter} onValueChange={(v) => setModuleFilter(v as QuestionModule | 'all')}>
          <SelectTrigger className="sm:w-44" aria-label={t('admin.questions.module')}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('admin.questions.allModules')}</SelectItem>
            {MODULES.map((m) => (
              <SelectItem key={m} value={m}>
                {t(MODULE_LABEL_KEY[m])}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Link href="/admin/questions/new" className={buttonVariants()}>
          <Plus className="h-4 w-4" /> {t('admin.questions.newQuestion')}
        </Link>
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
            {t('admin.questions.loadFailed')}
            <Button variant="outline" size="sm" onClick={() => query.refetch()}>
              {t('common.tryAgain')}
            </Button>
          </CardContent>
        </Card>
      )}

      {query.data && questions.length === 0 && (
        <Card>
          <CardContent className="p-10 text-center text-sm text-muted-foreground">
            {t('admin.questions.empty')}
          </CardContent>
        </Card>
      )}

      {query.data && questions.length > 0 && (
        <Card>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('admin.questions.stem')}</TableHead>
                  <TableHead>{t('admin.questions.module')}</TableHead>
                  <TableHead>{t('admin.questions.difficulty')}</TableHead>
                  <TableHead>{t('admin.questions.status')}</TableHead>
                  <TableHead>{t('admin.questions.version')}</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {questions.map((q) => (
                  <TableRow key={q.id}>
                    <TableCell className="max-w-md">
                      <Link
                        href={`/admin/questions/${q.id}`}
                        className="line-clamp-2 font-medium text-primary hover:underline"
                      >
                        {q.stem}
                      </Link>
                      <span className="text-xs text-muted-foreground">{q.category.name}</span>
                    </TableCell>
                    <TableCell>
                      <Badge variant={moduleBadgeVariant(q.module)}>
                        {t(MODULE_LABEL_KEY[q.module])}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <DifficultyDots level={q.difficulty} />
                    </TableCell>
                    <TableCell>
                      <Badge variant={STATUS_BADGE[q.status]}>
                        {t(`admin.questions.statusLabel.${q.status}`)}
                      </Badge>
                    </TableCell>
                    <TableCell className="tabular-nums text-muted-foreground">v{q.version}</TableCell>
                    <TableCell className="w-10 text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" aria-label={t('admin.questions.actions')}>
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem asChild>
                            <Link href={`/admin/questions/${q.id}`}>
                              <Pencil className="h-4 w-4" /> {t('admin.questions.edit')}
                            </Link>
                          </DropdownMenuItem>
                          {q.status === 'draft' && (
                            <DropdownMenuItem onSelect={() => act.mutate({ kind: 'submit', q })}>
                              <Send className="h-4 w-4" /> {t('admin.questions.submit')}
                            </DropdownMenuItem>
                          )}
                          {q.status === 'published' && (
                            <DropdownMenuItem onSelect={() => act.mutate({ kind: 'newVersion', q })}>
                              <Copy className="h-4 w-4" /> {t('admin.questions.newVersion')}
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            className="text-error data-[highlighted]:text-error"
                            onSelect={() => act.mutate({ kind: 'remove', q })}
                          >
                            <Trash2 className="h-4 w-4" /> {t('admin.questions.delete')}
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
            {t('admin.questions.loadMore')}
          </Button>
        </div>
      )}
    </div>
  )
}
