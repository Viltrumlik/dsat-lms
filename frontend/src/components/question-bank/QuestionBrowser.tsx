// Domain: Question Bank
// Description: Client browser — filter state, debounced search, cursor-paginated
//   infinite query, and the result grid with loading/empty/error states.
'use client'

import * as React from 'react'
import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { SearchX } from 'lucide-react'
import { questionAPI, cursorFromUrl, type QuestionListParams } from '@/lib/api/questions'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { useI18n, plural } from '@/lib/i18n/I18nProvider'
import { QuestionFilters, type QuestionUIFilters } from './QuestionFilters'
import { QuestionCard } from './QuestionCard'

const EMPTY_FILTERS: QuestionUIFilters = { search: '' }

function useDebounced<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = React.useState(value)
  React.useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms)
    return () => clearTimeout(t)
  }, [value, ms])
  return debounced
}

export function QuestionBrowser() {
  const { t, locale } = useI18n()
  const [filters, setFilters] = React.useState<QuestionUIFilters>(EMPTY_FILTERS)
  const debouncedSearch = useDebounced(filters.search, 350)

  const categoriesQuery = useQuery({
    queryKey: ['question-categories'],
    queryFn: () => questionAPI.categories(),
    staleTime: 5 * 60 * 1000,
  })

  const params: QuestionListParams = {
    module: filters.module,
    difficulty: filters.difficulty,
    answerType: filters.answerType,
    category: filters.category,
    search: debouncedSearch.trim() || undefined,
  }

  const query = useInfiniteQuery({
    queryKey: ['questions', params],
    queryFn: ({ pageParam }) => questionAPI.list({ ...params, cursor: pageParam }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => cursorFromUrl(lastPage.pagination?.next ?? null) ?? undefined,
  })

  const items = query.data?.pages.flatMap((p) => p.data) ?? []
  const hasActiveFilters =
    !!filters.module ||
    !!filters.difficulty ||
    !!filters.answerType ||
    !!filters.category ||
    filters.search.trim() !== ''

  // Patch filters; clearing/switching module drops a now-irrelevant category.
  const patch = (p: Partial<QuestionUIFilters>) =>
    setFilters((prev) => {
      const next = { ...prev, ...p }
      if ('module' in p && p.module !== prev.module) next.category = undefined
      return next
    })

  return (
    <div className="space-y-6">
      <QuestionFilters
        value={filters}
        onChange={patch}
        onReset={() => setFilters(EMPTY_FILTERS)}
        categories={categoriesQuery.data ?? []}
        hasActiveFilters={hasActiveFilters}
      />

      {query.isLoading && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Card key={i}>
              <CardContent className="space-y-3 p-5">
                <div className="h-5 w-24 animate-pulse rounded bg-muted" />
                <div className="h-4 w-full animate-pulse rounded bg-muted" />
                <div className="h-4 w-4/5 animate-pulse rounded bg-muted" />
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {query.isError && (
        <Card>
          <CardContent className="p-5 text-sm text-muted-foreground">
            {t('questionBank.loadFailed')}
          </CardContent>
        </Card>
      )}

      {query.isSuccess && items.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 p-10 text-center">
            <SearchX className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              {hasActiveFilters
                ? t('questionBank.emptyFiltered')
                : t('questionBank.emptyAll')}
            </p>
            {hasActiveFilters && (
              <Button variant="outline" size="sm" onClick={() => setFilters(EMPTY_FILTERS)}>
                {t('questionBank.filters.clear')}
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      {items.length > 0 && (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {items.map((q) => (
              <QuestionCard key={q.id} q={q} />
            ))}
          </div>

          <div className="flex justify-center">
            {query.hasNextPage ? (
              <Button
                variant="outline"
                loading={query.isFetchingNextPage}
                onClick={() => query.fetchNextPage()}
              >
                {t('questionBank.loadMore')}
              </Button>
            ) : (
              <p className="text-sm text-muted-foreground">
                {plural(
                  locale,
                  items.length,
                  t('questionBank.countAllOne', { count: items.length }),
                  t('questionBank.countAllOther', { count: items.length })
                )}
              </p>
            )}
          </div>
        </>
      )}
    </div>
  )
}
