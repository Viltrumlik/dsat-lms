// Domain: Analytics
// Description: Per-topic accuracy — a lazy Recharts bar chart plus a detailed
//   list with progress bars and exact counts.
'use client'

import dynamic from 'next/dynamic'
import { useQuery } from '@tanstack/react-query'
import { BarChart3 } from 'lucide-react'
import { analyticsAPI } from '@/lib/api/analytics'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { num, pct } from '@/lib/utils/num'
import type { QuestionModule } from '@/types'

const MODULE_LABEL: Record<QuestionModule, string> = {
  math: 'Math',
  reading_writing: 'Reading & Writing',
}

const Chart = dynamic(() => import('./AccuracyByCategoryChart'), {
  ssr: false,
  loading: () => <div className="h-48 animate-pulse rounded-lg bg-muted" />,
})

export function CategoryMastery() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['analytics', 'progress'],
    queryFn: analyticsAPI.progress,
  })

  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold">Accuracy by topic</h2>
        <p className="text-sm text-muted-foreground">How you&apos;re doing in each area.</p>
      </div>

      {isLoading && <div className="h-64 animate-pulse rounded-xl bg-muted" />}

      {isError && (
        <Card>
          <CardContent className="p-5 text-sm text-muted-foreground">
            Couldn&apos;t load your progress. Please try again.
          </CardContent>
        </Card>
      )}

      {data && data.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 p-10 text-center">
            <BarChart3 className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              Answer some questions to see your topic breakdown.
            </p>
          </CardContent>
        </Card>
      )}

      {data && data.length > 0 && (
        <>
          <Card>
            <CardContent className="p-5">
              <Chart data={data} />
            </CardContent>
          </Card>

          <Card>
            <CardContent className="divide-y divide-border p-0">
              {data.map((r) => (
                <div key={r.category} className="flex items-center gap-4 p-4">
                  <Badge variant={r.module === 'math' ? 'math' : 'rw'} className="shrink-0">
                    {MODULE_LABEL[r.module]}
                  </Badge>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm font-medium">{r.categoryName}</span>
                      <span className="shrink-0 text-sm tabular-nums text-muted-foreground">
                        {r.totalCorrect}/{r.totalAnswered} · {pct(r.accuracyPct)}
                      </span>
                    </div>
                    <Progress
                      value={num(r.accuracyPct) ?? 0}
                      className="mt-2"
                      indicatorClassName={r.module === 'math' ? 'bg-math' : 'bg-rw'}
                    />
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </>
      )}
    </section>
  )
}
