// Domain: Analytics (admin)
// Description: Platform analytics dashboards (reached from the admin sidebar).
import { PlatformAnalyticsView } from '@/components/admin/PlatformAnalyticsView'

export const metadata = { title: 'Analytics' }

export default function AdminAnalyticsPage() {
  return (
    <div className="mx-auto max-w-6xl">
      <PlatformAnalyticsView />
    </div>
  )
}
