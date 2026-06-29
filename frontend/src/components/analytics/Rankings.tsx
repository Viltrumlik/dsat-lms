// Domain: Analytics
// Description: Academy leaderboard (top by accuracy). Public users get a 403 from
//   the API — shown as a friendly "academy only" locked state, not an error.
'use client'

import { useQuery } from '@tanstack/react-query'
import { AxiosError } from 'axios'
import { Lock, Trophy } from 'lucide-react'
import { analyticsAPI } from '@/lib/api/analytics'
import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils/cn'
import { pct } from '@/lib/utils/num'

function statusOf(err: unknown): number | undefined {
  return err instanceof AxiosError ? err.response?.status : undefined
}

export function Rankings() {
  const { data, isLoading, error, isError } = useQuery({
    queryKey: ['analytics', 'rankings'],
    queryFn: analyticsAPI.rankings,
    // Don't hammer the server on permission/other 4xx — they won't change.
    retry: (failureCount, err) => {
      const status = statusOf(err)
      if (status && status >= 400 && status < 500) return false
      return failureCount < 2
    },
  })

  const academyOnly = isError && statusOf(error) === 403

  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold">Leaderboard</h2>
        <p className="text-sm text-muted-foreground">Top academy students by accuracy.</p>
      </div>

      {isLoading && <div className="h-40 animate-pulse rounded-xl bg-muted" />}

      {academyOnly && (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 p-10 text-center">
            <Lock className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              The leaderboard is available to academy members.
            </p>
          </CardContent>
        </Card>
      )}

      {isError && !academyOnly && (
        <Card>
          <CardContent className="p-5 text-sm text-muted-foreground">
            Couldn&apos;t load the leaderboard. Please try again.
          </CardContent>
        </Card>
      )}

      {data && data.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 p-10 text-center">
            <Trophy className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">No rankings yet — be the first to practice.</p>
          </CardContent>
        </Card>
      )}

      {data && data.length > 0 && (
        <Card>
          <CardContent className="divide-y divide-border p-0">
            {data.map((row) => (
              <div
                key={row.rank}
                className={cn(
                  'flex items-center gap-4 px-5 py-3',
                  row.isMe && 'bg-primary-50 dark:bg-primary-800/30'
                )}
              >
                <span className="w-6 shrink-0 text-sm font-semibold tabular-nums text-muted-foreground">
                  {row.rank}
                </span>
                <span className="min-w-0 flex-1 truncate text-sm font-medium">
                  {row.name}
                  {row.isMe && <span className="ml-2 text-xs text-primary">You</span>}
                </span>
                <span className="shrink-0 text-sm tabular-nums text-muted-foreground">
                  {row.totalAnswered} answered
                </span>
                <span className="w-16 shrink-0 text-right text-sm font-semibold tabular-nums">
                  {pct(row.accuracy)}
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </section>
  )
}
