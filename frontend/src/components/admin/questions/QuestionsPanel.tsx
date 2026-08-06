// Domain: Admin (content studio)
// Description: The question workspace — the bank on the left, the authoring
//   pane on the right. Adding and editing happen in place, so an author can
//   write a run of questions without a single page navigation.
// URL: the selected question is written into the address bar with history.replaceState,
//   NOT a router navigation — /admin/questions and /admin/questions/[id] are
//   different route segments, so navigating would remount the panel and throw
//   away whatever the author had typed. The path stays linkable either way.
'use client'

import * as React from 'react'
import Link from 'next/link'
import { FilePlus2 } from 'lucide-react'
import { useT } from '@/lib/i18n/I18nProvider'
import { cn } from '@/lib/utils/cn'
import { Button } from '@/components/ui/button'
import { VocabularyPanel } from '@/components/admin/vocabulary/VocabularyPanel'
import { QuestionListPane } from './QuestionListPane'
import { QuestionEditorPane } from './QuestionEditorPane'

/** Reflect the selection in the address bar without triggering a route change. */
function syncUrl(path: string) {
  if (typeof window !== 'undefined' && window.location.pathname !== path) {
    window.history.replaceState(null, '', path)
  }
}

export function QuestionsPanel({
  initialQuestionId,
  initialCreating = false,
}: {
  initialQuestionId?: string
  /** Deep link to /admin/questions/new — open a blank draft immediately. */
  initialCreating?: boolean
}) {
  const t = useT()

  // `null` + creating = a blank draft; `null` + !creating = nothing selected.
  const [selectedId, setSelectedId] = React.useState<string | null>(initialQuestionId ?? null)
  const [creating, setCreating] = React.useState(initialCreating)

  const select = React.useCallback((id: string) => {
    setCreating(false)
    setSelectedId(id)
    syncUrl(`/admin/questions/${id}`)
  }, [])

  const startNew = React.useCallback(() => {
    setSelectedId(null)
    setCreating(true)
    syncUrl('/admin/questions/new')
  }, [])

  const clearSelection = React.useCallback(() => {
    setSelectedId(null)
    setCreating(false)
    syncUrl('/admin/questions')
  }, [])

  const showEditor = creating || selectedId !== null

  // Two kinds of content are authored here. Vocabulary is its own section rather
  // than its own page because it is the same job — writing the bank — and an
  // author moves between the two in one sitting.
  const [tab, setTab] = React.useState<'questions' | 'vocabulary'>('questions')

  return (
    <div className="flex h-[calc(100dvh-8rem)] min-h-[34rem] flex-col overflow-hidden rounded-xl border border-border bg-card">
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-2.5">
        <div className="flex items-center gap-4">
          <div>
            <h1 className="text-base font-bold">{t('admin.contentStudio')}</h1>
            <p className="text-xs text-muted-foreground">
              {tab === 'questions' ? t('admin.questions.subtitle') : t('admin.vocab.subtitle')}
            </p>
          </div>
          <div className="flex gap-1 rounded-lg bg-muted p-1" role="tablist">
            {(['questions', 'vocabulary'] as const).map((key) => (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={tab === key}
                onClick={() => setTab(key)}
                className={cn(
                  'rounded-md px-3 py-1 text-sm font-medium transition-colors',
                  tab === key
                    ? 'bg-card text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                {t(`admin.contentTabs.${key}`)}
              </button>
            ))}
          </div>
        </div>
        {tab === 'questions' && (
          <Link href="/admin/questions/taxonomy" className="text-sm text-primary hover:underline">
            {t('admin.taxonomy.manageLink')}
          </Link>
        )}
      </div>

      {tab === 'vocabulary' && <VocabularyPanel />}

      <div className={cn('flex min-h-0 flex-1', tab !== 'questions' && 'hidden')}>
        <QuestionListPane
          selectedId={selectedId}
          onSelect={select}
          onNew={startNew}
          creating={creating}
        />

        <div className="min-w-0 flex-1">
          {showEditor ? (
            <QuestionEditorPane
              key={selectedId ?? 'new'}
              questionId={selectedId}
              onCreated={(q) => select(q.id)}
              onDeleted={clearSelection}
            />
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-3 p-10 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-muted">
                <FilePlus2 className="h-6 w-6 text-muted-foreground" />
              </div>
              <p className="font-semibold">{t('admin.questions.nothingSelected')}</p>
              <p className="max-w-sm text-sm text-muted-foreground">
                {t('admin.questions.nothingSelectedHint')}
              </p>
              <Button onClick={startNew}>{t('admin.questions.newQuestion')}</Button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
