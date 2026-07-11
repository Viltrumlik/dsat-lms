// Domain: Audit (admin)
// Description: The activity-log viewer (reached from the admin sidebar).
import { AuditLogView } from '@/components/admin/AuditLogView'

export const metadata = { title: 'Activity log' }

export default function AdminAuditPage() {
  return (
    <div className="mx-auto max-w-6xl">
      <AuditLogView />
    </div>
  )
}
