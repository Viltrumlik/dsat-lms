// Domain: Identity (admin)
// Description: Org settings — branding, academic year, grading scheme, feature flags.
import { OrgSettingsView } from '@/components/admin/OrgSettingsView'

export const metadata = { title: 'Settings' }

export default function AdminSettingsPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <OrgSettingsView />
    </div>
  )
}
