// Domain: Identity (admin)
// Description: Permissions matrix — role × capability switch grid (Phase 5.6a).
import { PermissionsMatrix } from '@/components/admin/PermissionsMatrix'

export const metadata = { title: 'Permissions' }

export default function AdminPermissionsPage() {
  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <PermissionsMatrix />
    </div>
  )
}
