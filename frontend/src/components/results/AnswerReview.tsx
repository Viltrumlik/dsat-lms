// Domain: Student / Results
// Description: Post-submission answer review — every question with the correct
//   answer, the student's answer, and whether they matched. Clicking a row opens
//   the full per-question review (passage, stem, choices, explanation).
// Data: GET /sessions/{id}/review/ — read live from the question bank, so a
//   correction an admin makes shows up here immediately.
'use client'

import * as React from 'react'
import { useQuery } from '@tanstack/react-query'
import { CheckCircle2, MinusCircle, XCircle } from 'lucide-react'
import { sessionAPI } from '@/lib/api/sessions'
import { useT } from '@/lib/i18n/I18nProvider'
import { cn } from '@/lib/utils/cn'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Spinner } from '@/components/ui/spinner'
import { MarkdownMath } from '@/components/test-engine/MarkdownMath'
import type { AnswerReviewStatus, SessionReviewItem } from '@/types'

const STATUS_META: Record<
  AnswerReviewStatus,
  { icon: React.ComponentType<{ className?: string }>; tone: string; labelKey: string }
> = {
  correct: { icon: CheckCircle2, tone: 'text-success', labelKey: 'results.review.correct' },
  incorrect: { icon: XCircle, tone: 'text-error', labelKey: 'results.review.incorrect' },
  skipped: { icon: MinusCircle, tone: 'text-muted-foreground', labelKey: 'results.review.skipped' },
}

function StatusIcon({ status }: { status: AnswerReviewStatus }) {
  const t = useT()
  const meta = STATUS_META[status]
  const Icon = meta.icon
  return <Icon className={cn('h-5 w-5 shrink-0', meta.tone)} aria-label={t(meta.labelKey)} />
}

/** "A" for MCQ, the raw value for a grid-in. */
function AnswerChip({
  value,
  tone,
}: {
  value: string | null
  tone: 'correct' | 'chosen' | 'muted'
}) {
  return (
    <span
      className={cn(
        'inline-flex min-w-[1.75rem] items-center justify-center rounded-md px-2 py-0.5 text-sm font-semibold',
        tone === 'correct' && 'bg-success-light text-success-dark',
        tone === 'chosen' && 'bg-error-light text-error-dark',
        tone === 'muted' && 'bg-muted text-muted-foreground'
      )}
    >
      {value && value.trim() ? value : '—'}
    </span>
  )
}

function ReviewRow({ item, onOpen }: { item: SessionReviewItem; onOpen: () => void }) {
  const t = useT()
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex w-full items-center gap-3 rounded-lg border border-border px-3 py-2.5 text-left transition-colors hover:border-primary-300 hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <span className="w-7 shrink-0 text-sm font-semibold tabular-nums text-muted-foreground">
        {item.number}
      </span>
      <StatusIcon status={item.status} />
      {/* Rendered (not raw) so KaTeX/markdown stems read correctly, clamped to
          one line so every row stays the same height. */}
      <span className="min-w-0 flex-1 overflow-hidden">
        <MarkdownMath
          content={item.question.stem}
          className="line-clamp-1 text-sm [&_p]:m-0"
        />
      </span>
      <span className="flex shrink-0 items-center gap-3 text-xs">
        <span className="flex items-center gap-1.5">
          <span className="hidden text-muted-foreground sm:inline">
            {t('results.review.yours')}
          </span>
          <AnswerChip
            value={item.chosenAnswer}
            tone={item.status === 'correct' ? 'correct' : item.chosenAnswer ? 'chosen' : 'muted'}
          />
        </span>
        <span className="flex items-center gap-1.5">
          <span className="hidden text-muted-foreground sm:inline">
            {t('results.review.answer')}
          </span>
          <AnswerChip value={item.correctAnswer} tone="correct" />
        </span>
      </span>
    </button>
  )
}

function QuestionDialog({
  item,
  open,
  onOpenChange,
}: {
  item: SessionReviewItem | null
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const t = useT()
  if (!item) return null

  const { question } = item
  const ordered = question.choices.slice().sort((a, b) => a.sortOrder - b.sortOrder)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <StatusIcon status={item.status} />
            {t('results.review.questionN', { number: item.number })}
            <span className="text-sm font-normal text-muted-foreground">
              · {t(STATUS_META[item.status].labelKey)}
            </span>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {question.passageImageUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={question.passageImageUrl}
              alt=""
              className="max-w-full rounded-md border border-border"
            />
          )}
          {question.passage && (
            <div className="rounded-lg bg-muted/60 p-3">
              <MarkdownMath content={question.passage} className="text-sm leading-relaxed" />
            </div>
          )}

          {question.stemImageUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={question.stemImageUrl}
              alt=""
              className="max-w-full rounded-md border border-border"
            />
          )}
          <MarkdownMath content={question.stem} className="font-medium leading-relaxed" />

          {question.answerType === 'mcq' ? (
            <ul className="space-y-2">
              {ordered.map((choice) => {
                const isCorrect = choice.label === item.correctAnswer
                const isChosen = choice.label === item.chosenAnswer
                return (
                  <li
                    key={choice.label}
                    className={cn(
                      'flex items-start gap-3 rounded-lg border p-3',
                      isCorrect && 'border-success bg-success-light/40',
                      !isCorrect && isChosen && 'border-error bg-error-light/40',
                      !isCorrect && !isChosen && 'border-border'
                    )}
                  >
                    <span
                      className={cn(
                        'flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-xs font-semibold',
                        isCorrect && 'border-success bg-success text-white',
                        !isCorrect && isChosen && 'border-error bg-error text-white',
                        !isCorrect && !isChosen && 'border-border'
                      )}
                    >
                      {choice.label}
                    </span>
                    <span className="min-w-0 flex-1">
                      <MarkdownMath content={choice.text} className="text-sm [&_p]:m-0" />
                    </span>
                    {(isCorrect || isChosen) && (
                      <span
                        className={cn(
                          'shrink-0 text-xs font-semibold',
                          isCorrect ? 'text-success-dark' : 'text-error-dark'
                        )}
                      >
                        {isCorrect ? t('results.review.answer') : t('results.review.yours')}
                      </span>
                    )}
                  </li>
                )
              })}
            </ul>
          ) : (
            <div className="flex flex-wrap gap-4 rounded-lg border border-border p-3 text-sm">
              <span className="flex items-center gap-2">
                {t('results.review.yours')}
                <AnswerChip
                  value={item.chosenAnswer}
                  tone={item.status === 'correct' ? 'correct' : item.chosenAnswer ? 'chosen' : 'muted'}
                />
              </span>
              <span className="flex items-center gap-2">
                {t('results.review.answer')}
                <AnswerChip value={item.correctAnswer} tone="correct" />
              </span>
            </div>
          )}

          {(item.explanation || item.explanationImageUrl) && (
            <div className="rounded-lg border border-border p-3">
              <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {t('results.review.explanation')}
              </p>
              {item.explanationImageUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={item.explanationImageUrl}
                  alt=""
                  className="mb-2 max-w-full rounded-md border border-border"
                />
              )}
              {item.explanation && (
                <MarkdownMath content={item.explanation} className="text-sm leading-relaxed" />
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

export function AnswerReview({ sessionId }: { sessionId: string }) {
  const t = useT()
  const [openIndex, setOpenIndex] = React.useState<number | null>(null)

  const query = useQuery({
    queryKey: ['session', sessionId, 'review'],
    queryFn: () => sessionAPI.review(sessionId),
    retry: 1,
  })

  if (query.isLoading) {
    return (
      <Card>
        <CardContent className="flex justify-center p-8">
          <Spinner className="h-6 w-6" />
        </CardContent>
      </Card>
    )
  }

  const items = query.data
  if (query.isError || !items || items.length === 0) return null

  const active = openIndex === null ? null : (items[openIndex] ?? null)

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('results.review.title')}</CardTitle>
        <p className="text-sm text-muted-foreground">{t('results.review.subtitle')}</p>
      </CardHeader>
      <CardContent className="space-y-2">
        {items.map((item, index) => (
          <ReviewRow key={item.question.id} item={item} onOpen={() => setOpenIndex(index)} />
        ))}
      </CardContent>

      <QuestionDialog
        item={active}
        open={active !== null}
        onOpenChange={(open) => !open && setOpenIndex(null)}
      />
    </Card>
  )
}
