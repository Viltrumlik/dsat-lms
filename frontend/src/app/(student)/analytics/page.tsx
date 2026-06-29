// Domain: Analytics
// Description: Student analytics — overall summary, per-topic accuracy, leaderboard.
import { SummaryCards } from '@/components/dashboard/SummaryCards'
import { CategoryMastery } from '@/components/analytics/CategoryMastery'
import { Rankings } from '@/components/analytics/Rankings'

export const metadata = { title: 'Analytics' }

export default function AnalyticsPage() {
  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Analytics</h1>
        <p className="text-muted-foreground">Track your accuracy and progress by topic.</p>
      </div>
      <SummaryCards />
      <CategoryMastery />
      <Rankings />
    </div>
  )
}
