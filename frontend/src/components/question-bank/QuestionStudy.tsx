// Domain: Question Bank
// Description: Study view for a single question — passage + stem (KaTeX), choices
//   you can try, then reveal the correct answer + explanation.
'use client'

import * as React from 'react'
import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, CheckCircle2, Eye, XCircle } from 'lucide-react'
import { questionAPI } from '@/lib/api/questions'
import { Button, buttonVariants } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { FullPageSpinner } from '@/components/ui/spinner'
import { MarkdownMath } from '@/components/test-engine/MarkdownMath'
import { cn } from '@/lib/utils/cn'
import { DifficultyDots } from './DifficultyDots'
import { MODULE_LABEL, ANSWER_TYPE_LABEL, DIFFICULTY_LABEL, moduleBadgeVariant } from './labels'
import type { QuestionChoice } from '@/types'

const SOURCE_LABEL: Record<string, string> = {
  official: 'Official SAT',
  custom: 'Custom',
  imported: 'Imported',
}

function BackLink() {
  return (
    <Link
      href="/questions"
      className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
    >
      <ArrowLeft className="h-4 w-4" /> Back to Question Bank
    </Link>
  )
}

function ChoiceRow({
  choice,
  selected,
  revealed,
  isCorrect,
  onSelect,
}: {
  choice: QuestionChoice
  selected: boolean
  revealed: boolean
  isCorrect: boolean
  onSelect: () => void
}) {
  const showCorrect = revealed && isCorrect
  const showWrong = revealed && selected && !isCorrect

  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      disabled={revealed}
      onClick={onSelect}
      className={cn(
        'flex w-full items-start gap-3 rounded-lg border-2 p-3 text-left transition-colors',
        showCorrect && 'border-success bg-success-light',
        showWrong && 'border-error bg-error-light',
        !showCorrect && !showWrong && selected && 'border-primary bg-primary-50 dark:bg-primary-800/30',
        !showCorrect && !showWrong && !selected && 'border-border hover:border-primary-300 hover:bg-muted/50',
        revealed && 'cursor-default'
      )}
    >
      <span
        className={cn(
          'flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-sm font-semibold',
          selected ? 'border-primary bg-primary text-primary-foreground' : 'border-border text-foreground'
        )}
      >
        {choice.label}
      </span>
      <span className="flex-1 pt-0.5 text-foreground">
        <MarkdownMath content={choice.text} className="[&_p]:m-0" />
      </span>
      {showCorrect && <CheckCircle2 className="h-5 w-5 shrink-0 text-success" />}
      {showWrong && <XCircle className="h-5 w-5 shrink-0 text-error" />}
    </button>
  )
}

export function QuestionStudy({ id }: { id: string }) {
  const [selected, setSelected] = React.useState<string | null>(null)
  const [gridAnswer, setGridAnswer] = React.useState('')
  const [revealed, setRevealed] = React.useState(false)

  const { data: q, isLoading, isError } = useQuery({
    queryKey: ['question', id],
    queryFn: () => questionAPI.get(id),
  })

  // Reset interaction state when navigating to a different question.
  React.useEffect(() => {
    setSelected(null)
    setGridAnswer('')
    setRevealed(false)
  }, [id])

  if (isLoading) return <FullPageSpinner label="Loading question…" />

  if (isError || !q) {
    return (
      <div className="mx-auto flex max-w-3xl flex-col items-center gap-4 py-16 text-center">
        <p className="text-muted-foreground">This question couldn&apos;t be found.</p>
        <Link href="/questions" className={cn(buttonVariants({ variant: 'outline' }))}>
          Back to Question Bank
        </Link>
      </div>
    )
  }

  const isMcq = q.answerType === 'mcq'
  const choices = q.choices.slice().sort((a, b) => a.sortOrder - b.sortOrder)
  const canReveal = isMcq ? selected !== null : gridAnswer.trim() !== ''
  const gridCorrect =
    revealed && gridAnswer.trim() !== '' && gridAnswer.trim() === q.correctAnswer.trim()

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <BackLink />

      {/* Meta */}
      <div className="flex flex-wrap items-center gap-3">
        <Badge variant={moduleBadgeVariant(q.module)}>{MODULE_LABEL[q.module]}</Badge>
        <Badge variant="outline">{ANSWER_TYPE_LABEL[q.answerType]}</Badge>
        <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <DifficultyDots level={q.difficulty} /> {DIFFICULTY_LABEL[q.difficulty]}
        </span>
        {q.category?.name && (
          <span className="text-sm text-muted-foreground">· {q.category.name}</span>
        )}
      </div>

      {/* Passage */}
      {q.passage && (
        <Card>
          <CardContent className="p-5">
            <MarkdownMath content={q.passage} />
          </CardContent>
        </Card>
      )}

      {/* Stem */}
      <div className="text-lg leading-relaxed">
        <MarkdownMath content={q.stem} />
      </div>

      {/* Answer area */}
      {isMcq ? (
        <div className="space-y-3" role="radiogroup" aria-label="Answer choices">
          {choices.map((c) => (
            <ChoiceRow
              key={c.label}
              choice={c}
              selected={selected === c.label}
              revealed={revealed}
              isCorrect={c.label === q.correctAnswer}
              onSelect={() => setSelected(c.label)}
            />
          ))}
        </div>
      ) : (
        <div className="max-w-xs space-y-2">
          <label htmlFor="study-grid-in" className="text-sm font-medium">
            Your answer
          </label>
          <Input
            id="study-grid-in"
            inputMode="text"
            autoComplete="off"
            placeholder="e.g. 3.5 or 7/2"
            maxLength={8}
            disabled={revealed}
            value={gridAnswer}
            onChange={(e) => setGridAnswer(e.target.value)}
            className="font-mono text-lg"
          />
        </div>
      )}

      {/* Reveal / verdict */}
      {!revealed ? (
        <Button onClick={() => setRevealed(true)} disabled={!canReveal}>
          <Eye className="h-4 w-4" /> Reveal answer
        </Button>
      ) : (
        <div className="space-y-4">
          {!isMcq && (
            <div
              className={cn(
                'flex items-center gap-2 rounded-lg border p-3 text-sm',
                gridCorrect
                  ? 'border-success bg-success-light text-success-dark'
                  : 'border-border bg-muted'
              )}
            >
              {gridCorrect ? (
                <CheckCircle2 className="h-5 w-5 text-success" />
              ) : (
                <XCircle className="h-5 w-5 text-muted-foreground" />
              )}
              <span>
                Correct answer: <strong className="font-mono">{q.correctAnswer}</strong>
              </span>
            </div>
          )}

          {q.explanation ? (
            <Card>
              <CardContent className="space-y-2 p-5">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                  Explanation
                </h2>
                <MarkdownMath content={q.explanation} />
              </CardContent>
            </Card>
          ) : (
            <p className="text-sm text-muted-foreground">No explanation provided for this question.</p>
          )}

          {q.sourceRef && (
            <p className="text-xs text-muted-foreground">
              Source: {SOURCE_LABEL[q.source] ?? q.source} · {q.sourceRef}
            </p>
          )}
        </div>
      )}
    </div>
  )
}
