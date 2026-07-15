// Domain: Analytics (admin)
// Description: /admin landing → the executive control center.
import { DashboardView } from '@/components/admin/DashboardView'

export const metadata = { title: 'Dashboard' }

export default function AdminDashboardPage() {
  return (
    <div className="mx-auto max-w-6xl">
      <DashboardView />
    </div>
  )
}
