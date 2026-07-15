// Domain: Automation (admin)
// Description: Automation engine — visual rule builder + activity log (Phase 5.6c).
import { AutomationView } from '@/components/admin/AutomationView'

export const metadata = { title: 'Automation' }

export default function AdminAutomationPage() {
  return (
    <div className="mx-auto max-w-5xl">
      <AutomationView />
    </div>
  )
}
