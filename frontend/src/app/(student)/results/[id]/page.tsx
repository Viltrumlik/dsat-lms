// Domain: Student / Results
// Description: Post-submission score report — total/math/rw, accuracy, counts,
//   time, percentile, and per-category breakdown.
'use client'

import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import { CheckCircle2, Clock, ListChecks, MinusCircle, Target, XCircle } from 'lucide-react'
import { sessionAPI } from '@/lib/api/sessions'
import { num, pct, formatDuration } from '@/lib/utils/num'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Button, buttonVariants } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { cn } from '@/lib/utils/cn'
import type { CategoryBreakdown } from '@/types'

function ScoreHero({ total, math, rw }: { total: number | null; math: number | null; rw: number | null }) {
  return (
    <Card className="overflow-hidden">
      <div className="bg-gradient-to-br from-primary-600 to-primary-800 p-8 text-center text-white">
        <p className="text-sm font-medium uppercase tracking-wide text-primary-100">Total score</p>
        <p className="mt-2 text-6xl font-bold tabular-nums">{total ?? '—'}</p>
        {total !== null && <p className="mt-1 text-sm text-primary-100">out of 1600</p>}
        <div className="mt-6 flex justify-center gap-4">
          {math !== null && (
            <div className="rounded-lg bg-white/10 px-5 py-3">
              <p className="text-xs uppercase tracking-wide text-primary-100">Math</p>
              <p className="text-2xl font-bold tabular-nums">{math}</p>
            </div>
          )}
          {rw !== null && (
            <div className="rounded-lg bg-white/10 px-5 py-3">
              <p className="text-xs uppercase tracking-wide text-primary-100">Reading &amp; Writing</p>
              <p className="text-2xl font-bold tabular-nums">{rw}</p>
            </div>
          )}
        </div>
      </div>
    </Card>
  )
}

function Stat({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  value: string
  tone?: string
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 p-4">
        <Icon className={cn('h-5 w-5', tone ?? 'text-muted-foreground')} />
        <div>
          <p className="text-lg font-semibold leading-tight tabular-nums">{value}</p>
          <p className="text-xs text-muted-foreground">{label}</p>
        </div>
      </CardContent>
    </Card>
  )
}

function CategoryRow({ cat }: { cat: CategoryBreakdown }) {
  const accuracy = num(cat.accuracy) ?? (cat.total ? (cat.correct / cat.total) * 100 : 0)
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium">{cat.name}</span>
        <span className="text-muted-foreground tabular-nums">
          {cat.correct}/{cat.total} · {accuracy.toFixed(0)}%
        </span>
      </div>
      <Progress value={accuracy} />
    </div>
  )
}

export default function ResultsPage({ params }: { params: { id: string } }) {
  const resultQuery = useQuery({
    queryKey: ['result', params.id],
    queryFn: () => sessionAPI.result(params.id),
    retry: 1,
  })
  const sessionQuery = useQuery({
    queryKey: ['session', params.id, 'meta'],
    queryFn: () => sessionAPI.get(params.id),
    retry: 1,
  })

  if (resultQuery.isLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Spinner className="h-8 w-8" />
      </div>
    )
  }

  if (resultQuery.isError || !resultQuery.data) {
    return (
      <div className="mx-auto max-w-md py-16 text-center">
        <XCircle className="mx-auto h-12 w-12 text-error" />
        <h1 className="mt-4 text-xl font-bold">Results unavailable</h1>
        <p className="mt-1 text-muted-foreground">We couldn&apos;t load this score report.</p>
        <Link href="/dashboard" className={cn(buttonVariants(), 'mt-6')}>
          Back to dashboard
        </Link>
      </div>
    )
  }

  const result = resultQuery.data
  const examTitle = sessionQuery.data?.exam.title ?? 'Practice Test'
  const categories = Object.values(result.scoreBreakdown?.categories ?? {})
  const percentile = num(result.percentile)

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="text-center">
        <CheckCircle2 className="mx-auto h-10 w-10 text-success" />
        <h1 className="mt-2 text-2xl font-bold">Test complete</h1>
        <p className="text-muted-foreground">{examTitle}</p>
      </div>

      <ScoreHero total={result.totalScore} math={result.mathScore} rw={result.rwScore} />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Stat icon={Target} label="Accuracy" value={pct(result.accuracyPct, 0)} tone="text-primary" />
        <Stat icon={ListChecks} label="Questions" value={String(result.totalQuestions)} />
        <Stat icon={CheckCircle2} label="Correct" value={String(result.totalCorrect)} tone="text-success" />
        <Stat icon={XCircle} label="Incorrect" value={String(result.totalIncorrect)} tone="text-error" />
        <Stat icon={MinusCircle} label="Skipped" value={String(result.totalSkipped)} />
        <Stat icon={Clock} label="Time" value={formatDuration(result.timeSpentSecs)} />
      </div>

      {percentile !== null && (
        <Card>
          <CardContent className="p-4 text-center text-sm">
            You scored higher than{' '}
            <span className="font-semibold text-primary">{percentile.toFixed(0)}%</span> of test
            takers.
          </CardContent>
        </Card>
      )}

      {categories.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>By category</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {categories.map((cat, i) => (
              <CategoryRow key={i} cat={cat} />
            ))}
          </CardContent>
        </Card>
      )}

      <div className="flex flex-col gap-3 pb-8 sm:flex-row sm:justify-center">
        <Link href="/dashboard" className={cn(buttonVariants({ variant: 'outline' }))}>
          Back to dashboard
        </Link>
        <Link href="/dashboard#tests" className={cn(buttonVariants())}>
          Take another test
        </Link>
      </div>
    </div>
  )
}
