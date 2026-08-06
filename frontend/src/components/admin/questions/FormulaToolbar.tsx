// Domain: Admin (content studio)
// Description: The authoring toolbar — a quick row of common marks plus a
//   categorised LaTeX library. Clicking a button splices its snippet into
//   whichever field the author last focused.
// Contract: every button suppresses the default pointerdown so the browser
//   never blurs the field before the click lands.
'use client'

import * as React from 'react'
import { useT } from '@/lib/i18n/I18nProvider'
import { cn } from '@/lib/utils/cn'
import { MarkdownMath } from '@/components/test-engine/MarkdownMath'
import { QUICK_SNIPPETS, SNIPPET_GROUPS, type Snippet } from './formulaCatalog'

/** Keeps focus (and therefore the caret) in the field being edited. */
function keepFocus(e: React.PointerEvent) {
  if (e.pointerType !== 'touch') e.preventDefault()
}

function SnippetButton({
  snippet,
  onInsert,
  size,
}: {
  snippet: Snippet
  onInsert: (insert: string, cursor: number) => void
  size: 'quick' | 'grid'
}) {
  const t = useT()
  const title = t(snippet.titleKey)
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onPointerDown={keepFocus}
      onClick={() => onInsert(snippet.insert, snippet.cursor)}
      className={cn(
        'inline-flex items-center justify-center rounded-md border border-border bg-background transition-colors hover:border-primary hover:bg-primary-50 active:scale-95 dark:hover:bg-primary-800/40',
        size === 'quick' ? 'h-8 min-w-[2.25rem] px-1.5' : 'h-9 min-w-[2.75rem] px-2'
      )}
    >
      {snippet.label ? (
        <span
          className={cn(
            'pointer-events-none leading-none',
            snippet.id === 'bold' && 'text-sm font-black',
            snippet.id === 'italic' && 'text-sm font-semibold italic',
            (snippet.id === 'math' || snippet.id === 'mathBlock') && 'font-mono text-[11px]',
            !['bold', 'italic', 'math', 'mathBlock'].includes(snippet.id) && 'text-sm'
          )}
        >
          {snippet.label}
        </span>
      ) : (
        <MarkdownMath
          content={`$${snippet.display}$`}
          className="pointer-events-none leading-none [&_p]:m-0"
        />
      )}
    </button>
  )
}

export function FormulaToolbar({
  onInsert,
  hasTarget,
}: {
  onInsert: (insert: string, cursor: number) => void
  hasTarget: boolean
}) {
  const t = useT()
  const [groupId, setGroupId] = React.useState(SNIPPET_GROUPS[0].id)
  const [expanded, setExpanded] = React.useState(false)
  const group = SNIPPET_GROUPS.find((g) => g.id === groupId) ?? SNIPPET_GROUPS[0]

  return (
    <div className="select-none rounded-lg border border-border bg-muted/40">
      <div className="flex flex-wrap items-center gap-1 px-2 py-1.5">
        <span className="mr-1 shrink-0 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
          {t('admin.questions.tools.quick')}
        </span>
        {QUICK_SNIPPETS.map((s) => (
          <SnippetButton key={s.id} snippet={s} onInsert={onInsert} size="quick" />
        ))}
        <button
          type="button"
          onPointerDown={keepFocus}
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          className="ml-auto shrink-0 rounded-md px-2 py-1 text-xs font-semibold text-primary hover:underline"
        >
          {expanded ? t('admin.questions.tools.fewer') : t('admin.questions.tools.more')}
        </button>
      </div>

      {expanded && (
        <div className="border-t border-border px-2 py-2">
          <div className="mb-2 flex flex-wrap gap-1">
            {SNIPPET_GROUPS.map((g) => (
              <button
                key={g.id}
                type="button"
                aria-pressed={g.id === groupId}
                onPointerDown={keepFocus}
                onClick={() => setGroupId(g.id)}
                className={cn(
                  'rounded-md px-2 py-0.5 text-[11px] font-bold transition-colors',
                  g.id === groupId
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                )}
              >
                {t(g.labelKey)}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap gap-1">
            {group.items.map((s) => (
              <SnippetButton key={s.id} snippet={s} onInsert={onInsert} size="grid" />
            ))}
          </div>
        </div>
      )}

      <p className="border-t border-border px-2.5 py-1 text-[11px] text-muted-foreground">
        {hasTarget ? t('admin.questions.tools.hintReady') : t('admin.questions.tools.hintFocus')}
      </p>
    </div>
  )
}
