// Domain: Support (admin)
// Description: The admin Support ops dashboard (reached from the admin sidebar).
import { SupportOpsView } from '@/components/admin/SupportOpsView'

export const metadata = { title: 'Support operations' }

export default function AdminSupportOpsPage() {
  return (
    <div className="mx-auto max-w-6xl">
      <SupportOpsView />
    </div>
  )
}
