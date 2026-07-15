// Domain: Analytics (admin)
// Description: Report exports (reached from the admin sidebar).
import { ReportsView } from '@/components/admin/ReportsView'

export const metadata = { title: 'Reports' }

export default function AdminReportsPage() {
  return (
    <div className="mx-auto max-w-4xl">
      <ReportsView />
    </div>
  )
}
