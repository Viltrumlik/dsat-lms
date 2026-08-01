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
import { Button } from '@/components/ui/button'
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

  return (
    <div className="flex h-[calc(100dvh-8rem)] min-h-[34rem] flex-col overflow-hidden rounded-xl border border-border bg-card">
      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border px-4 py-2.5">
        <div>
          <h1 className="text-base font-bold">{t('admin.questions.title')}</h1>
          <p className="text-xs text-muted-foreground">{t('admin.questions.subtitle')}</p>
        </div>
        <Link href="/admin/questions/taxonomy" className="text-sm text-primary hover:underline">
          {t('admin.taxonomy.manageLink')}
        </Link>
      </div>

      <div className="flex min-h-0 flex-1">
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
