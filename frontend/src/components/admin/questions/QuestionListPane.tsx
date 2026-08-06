// Domain: Admin (content studio)
// Description: The panel's left rail — search, filters, and the question rows.
//   Selecting a row swaps the editor beside it; nothing navigates away.
'use client'

import * as React from 'react'
import { useInfiniteQuery } from '@tanstack/react-query'
import { Plus, Search } from 'lucide-react'
import { adminQuestionsAPI } from '@/lib/api/admin/questions'
import { cursorFromUrl } from '@/lib/api/client'
import { useT } from '@/lib/i18n/I18nProvider'
import { useDebounced } from '@/lib/hooks/useDebounced'
import { cn } from '@/lib/utils/cn'
import { Badge, type BadgeProps } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Spinner } from '@/components/ui/spinner'
import { MarkdownMath } from '@/components/test-engine/MarkdownMath'
import type { AdminQuestionListItem, QuestionModule, QuestionStatus } from '@/types'

const STATUS_BADGE: Record<QuestionStatus, BadgeProps['variant']> = {
  draft: 'secondary',
  review: 'warning',
  published: 'success',
  archived: 'outline',
}

const ALL = 'all'

function QuestionRow({
  question,
  selected,
  onSelect,
}: {
  question: AdminQuestionListItem
  selected: boolean
  onSelect: () => void
}) {
  const t = useT()
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-current={selected}
      className={cn(
        'w-full rounded-lg border px-3 py-2.5 text-left transition-colors',
        selected
          ? 'border-primary bg-primary-50 dark:bg-primary-800/30'
          : 'border-border hover:border-primary-300 hover:bg-muted/60'
      )}
    >
      <div className="mb-1 flex flex-wrap items-center gap-1.5">
        <Badge variant={STATUS_BADGE[question.status]} className="text-[10px]">
          {t(`admin.questions.statusLabel.${question.status}`)}
        </Badge>
        <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-semibold uppercase text-muted-foreground">
          {question.module === 'math'
            ? t('admin.questions.moduleMathShort')
            : t('admin.questions.moduleRwShort')}
        </span>
        {question.answerType === 'grid_in' && (
          <span className="rounded bg-warning-light px-1.5 py-0.5 text-[10px] font-semibold uppercase text-warning-dark">
            {t('admin.questions.answerGridInShort')}
          </span>
        )}
        <span className="ml-auto text-[10px] font-semibold tabular-nums text-muted-foreground">
          D{question.difficulty}
        </span>
      </div>
      {question.stem?.trim() ? (
        // Rendered, not raw — a math stem is unreadable as LaTeX source.
        <MarkdownMath
          content={question.stem}
          className="line-clamp-2 text-xs leading-snug [&_p]:m-0"
        />
      ) : (
        <p className="text-xs italic text-muted-foreground">{t('admin.questions.untitled')}</p>
      )}
    </button>
  )
}

interface QuestionListPaneProps {
  selectedId: string | null
  onSelect: (id: string) => void
  onNew: () => void
  /** True while the editor is on an unsaved new question. */
  creating: boolean
}

export function QuestionListPane({
  selectedId,
  onSelect,
  onNew,
  creating,
}: QuestionListPaneProps) {
  const t = useT()
  const [search, setSearch] = React.useState('')
  const [status, setStatus] = React.useState<string>(ALL)
  const [module, setModule] = React.useState<string>(ALL)
  const debouncedSearch = useDebounced(search, 300)

  const query = useInfiniteQuery({
    queryKey: ['admin', 'questions', { status, module, search: debouncedSearch }],
    queryFn: ({ pageParam }) =>
      adminQuestionsAPI.list({
        status: status === ALL ? undefined : status,
        module: module === ALL ? undefined : (module as QuestionModule),
        search: debouncedSearch || undefined,
        cursor: pageParam,
      }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => cursorFromUrl(last.pagination?.next ?? null) ?? undefined,
  })

  const questions = query.data?.pages.flatMap((p) => p.data) ?? []

  return (
    <div className="flex h-full min-h-0 w-[19rem] shrink-0 flex-col border-r border-border">
      <div className="shrink-0 space-y-2 border-b border-border p-3">
        <Button className="w-full" size="sm" onClick={onNew} disabled={creating}>
          <Plus className="h-4 w-4" /> {t('admin.questions.newQuestion')}
        </Button>
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('admin.questions.searchPlaceholder')}
            aria-label={t('admin.questions.searchPlaceholder')}
            className="h-9 pl-8"
          />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="h-9" aria-label={t('admin.questions.status')}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>{t('admin.questions.allStatuses')}</SelectItem>
              <SelectItem value="draft">{t('admin.questions.statusLabel.draft')}</SelectItem>
              <SelectItem value="review">{t('admin.questions.statusLabel.review')}</SelectItem>
              <SelectItem value="published">{t('admin.questions.statusLabel.published')}</SelectItem>
              <SelectItem value="archived">{t('admin.questions.statusLabel.archived')}</SelectItem>
            </SelectContent>
          </Select>
          <Select value={module} onValueChange={setModule}>
            <SelectTrigger className="h-9" aria-label={t('admin.questions.module')}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>{t('admin.questions.allModules')}</SelectItem>
              <SelectItem value="math">{t('admin.questions.moduleMath')}</SelectItem>
              <SelectItem value="reading_writing">{t('admin.questions.moduleRw')}</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
        {creating && (
          <div className="rounded-lg border border-dashed border-primary bg-primary-50 px-3 py-2.5 text-xs font-semibold text-primary-700 dark:bg-primary-800/30 dark:text-primary-100">
            {t('admin.questions.draftInProgress')}
          </div>
        )}

        {query.isLoading ? (
          <div className="flex justify-center py-8">
            <Spinner className="h-5 w-5" />
          </div>
        ) : questions.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            {t('admin.questions.empty')}
          </p>
        ) : (
          questions.map((q) => (
            <QuestionRow
              key={q.id}
              question={q}
              selected={q.id === selectedId}
              onSelect={() => onSelect(q.id)}
            />
          ))
        )}

        {query.hasNextPage && (
          <Button
            variant="outline"
            size="sm"
            className="w-full"
            loading={query.isFetchingNextPage}
            onClick={() => query.fetchNextPage()}
          >
            {t('admin.questions.loadMore')}
          </Button>
        )}
      </div>
    </div>
  )
}
