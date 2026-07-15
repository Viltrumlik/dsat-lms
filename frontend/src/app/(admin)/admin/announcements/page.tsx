// Domain: Notifications (admin)
// Description: Broadcast announcements (reached from the admin sidebar).
import { AnnouncementsView } from '@/components/admin/AnnouncementsView'

export const metadata = { title: 'Announcements' }

export default function AdminAnnouncementsPage() {
  return (
    <div className="mx-auto max-w-5xl">
      <AnnouncementsView />
    </div>
  )
}
