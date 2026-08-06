// Domain: Admin (content studio)
// Description: Word-list authoring, living beside the question bank in the same
//   workspace — lists on the left, the selected list's decks and words on the
//   right. Nothing navigates away, the same as the question panel.
'use client'

import * as React from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { BookA, Plus } from 'lucide-react'
import { adminVocabularyAPI } from '@/lib/api/admin/vocabulary'
import { parseApiError } from '@/lib/api/errors'
import { useT } from '@/lib/i18n/I18nProvider'
import { cn } from '@/lib/utils/cn'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Spinner } from '@/components/ui/spinner'
import { useToast } from '@/components/ui/toast'
import { VocabSectionPane } from './VocabSectionPane'

export function VocabularyPanel() {
  const t = useT()
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const [selectedId, setSelectedId] = React.useState<string | null>(null)
  const [newTitle, setNewTitle] = React.useState('')

  const sections = useQuery({
    queryKey: ['admin-vocab-sections'],
    queryFn: () => adminVocabularyAPI.sections(),
  })

  const create = useMutation({
    mutationFn: (title: string) => adminVocabularyAPI.createSection({ title }),
    onSuccess: (section) => {
      setNewTitle('')
      setSelectedId(section.id)
      queryClient.invalidateQueries({ queryKey: ['admin-vocab-sections'] })
    },
    onError: (err) =>
      toast({
        variant: 'error',
        title: t('admin.vocab.createFailed'),
        description: parseApiError(err).message,
      }),
  })

  const rows = React.useMemo(() => sections.data ?? [], [sections.data])
  // Keep a selection pointing at something that still exists (e.g. after a delete).
  React.useEffect(() => {
    if (selectedId && !rows.some((s) => s.id === selectedId)) setSelectedId(null)
  }, [rows, selectedId])

  return (
    <div className="flex min-h-0 flex-1">
      <aside className="flex w-72 shrink-0 flex-col border-r border-border">
        <form
          className="flex gap-2 border-b border-border p-3"
          onSubmit={(e) => {
            e.preventDefault()
            if (newTitle.trim()) create.mutate(newTitle.trim())
          }}
        >
          <Input
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            placeholder={t('admin.vocab.newListPlaceholder')}
            aria-label={t('admin.vocab.newList')}
          />
          <Button type="submit" size="sm" disabled={!newTitle.trim()} loading={create.isPending}>
            <Plus className="h-4 w-4" />
          </Button>
        </form>

        <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto p-3">
          {sections.isLoading && (
            <div className="flex justify-center py-8">
              <Spinner className="h-5 w-5" />
            </div>
          )}
          {sections.isSuccess && rows.length === 0 && (
            <p className="px-1 py-6 text-center text-sm text-muted-foreground">
              {t('admin.vocab.noLists')}
            </p>
          )}
          {rows.map((section) => (
            <button
              key={section.id}
              type="button"
              onClick={() => setSelectedId(section.id)}
              aria-current={section.id === selectedId}
              className={cn(
                'w-full rounded-lg border px-3 py-2.5 text-left transition-colors',
                section.id === selectedId
                  ? 'border-primary bg-primary-50 dark:bg-primary-800/30'
                  : 'border-border hover:border-primary-300 hover:bg-muted/60'
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="truncate font-medium">{section.title}</span>
                <Badge
                  variant={section.status === 'published' ? 'success' : 'secondary'}
                  className="shrink-0 whitespace-nowrap"
                >
                  {t(`admin.vocab.status.${section.status}`)}
                </Badge>
              </div>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {t('admin.vocab.countsLine', {
                  sets: section.setCount,
                  words: section.wordCount,
                })}
              </p>
            </button>
          ))}
        </div>
      </aside>

      <div className="min-w-0 flex-1">
        {selectedId ? (
          <VocabSectionPane
            key={selectedId}
            sectionId={selectedId}
            onDeleted={() => setSelectedId(null)}
          />
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-3 p-10 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-muted">
              <BookA className="h-6 w-6 text-muted-foreground" />
            </div>
            <p className="font-semibold">{t('admin.vocab.nothingSelected')}</p>
            <p className="max-w-sm text-sm text-muted-foreground">
              {t('admin.vocab.nothingSelectedHint')}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
