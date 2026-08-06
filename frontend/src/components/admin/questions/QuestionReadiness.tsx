// Domain: Admin (content studio)
// Description: A live checklist of what still stands between this draft and a
//   publishable question — so an author sees the gaps while writing rather than
//   as a 400 on save.
'use client'

import { AlertTriangle, Check, CircleDashed } from 'lucide-react'
import { useT } from '@/lib/i18n/I18nProvider'
import { cn } from '@/lib/utils/cn'
import { CHOICE_LABELS, type ChoiceDraftMap } from './ChoicesEditor'
import type { AnswerType } from '@/types'

export interface ReadinessInput {
  answerType: AnswerType
  stem: string
  categoryId: string
  correctAnswer: string
  choices: ChoiceDraftMap
  explanation: string
}

export interface ReadinessItem {
  id: string
  labelKey: string
  done: boolean
  /** Advisory only — a question can be published without it. */
  optional?: boolean
}

/** The publish checklist. `blocking` items mirror the server's validation. */
export function readinessItems(input: ReadinessInput): ReadinessItem[] {
  const { answerType, stem, categoryId, correctAnswer, choices, explanation } = input
  const filled = CHOICE_LABELS.filter((l) => choices[l].text.trim() !== '')
  const key = correctAnswer.trim().toUpperCase()

  const items: ReadinessItem[] = [
    { id: 'stem', labelKey: 'admin.questions.check.stem', done: stem.trim().length > 0 },
    { id: 'category', labelKey: 'admin.questions.check.category', done: categoryId !== '' },
  ]

  if (answerType === 'mcq') {
    items.push(
      { id: 'choices', labelKey: 'admin.questions.check.choices', done: filled.length >= 2 },
      {
        id: 'key',
        labelKey: 'admin.questions.check.key',
        done: key !== '' && filled.includes(key as (typeof CHOICE_LABELS)[number]),
      }
    )
  } else {
    items.push({
      id: 'key',
      labelKey: 'admin.questions.check.gridKey',
      done: correctAnswer.trim() !== '',
    })
  }

  items.push({
    id: 'explanation',
    labelKey: 'admin.questions.check.explanation',
    done: explanation.trim().length > 0,
    optional: true,
  })
  return items
}

/** True when every blocking item is satisfied. */
export function isPublishable(items: ReadinessItem[]): boolean {
  return items.every((i) => i.optional || i.done)
}

export function QuestionReadiness({ items }: { items: ReadinessItem[] }) {
  const t = useT()
  const blocking = items.filter((i) => !i.optional)
  const remaining = blocking.filter((i) => !i.done).length
  const ready = remaining === 0

  return (
    <div
      className={cn(
        'rounded-lg border p-3',
        ready ? 'border-success/40 bg-success-light/40' : 'border-border bg-muted/40'
      )}
    >
      <div className="mb-2 flex items-center gap-2">
        {ready ? (
          <Check className="h-4 w-4 text-success" />
        ) : (
          <AlertTriangle className="h-4 w-4 text-warning" />
        )}
        <p className={cn('text-sm font-semibold', ready && 'text-success-dark')}>
          {ready
            ? t('admin.questions.check.ready')
            : t('admin.questions.check.remaining', { count: remaining })}
        </p>
      </div>
      <ul className="space-y-1">
        {items.map((item) => (
          <li key={item.id} className="flex items-center gap-2 text-xs">
            {item.done ? (
              <Check className="h-3.5 w-3.5 shrink-0 text-success" />
            ) : (
              <CircleDashed
                className={cn(
                  'h-3.5 w-3.5 shrink-0',
                  item.optional ? 'text-muted-foreground/60' : 'text-warning'
                )}
              />
            )}
            <span className={cn(item.done ? 'text-muted-foreground line-through' : 'text-foreground')}>
              {t(item.labelKey)}
            </span>
            {item.optional && (
              <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                {t('admin.questions.check.optional')}
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}
