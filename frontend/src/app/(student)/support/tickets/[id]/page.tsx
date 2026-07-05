// Domain: Support
// Description: A single support ticket thread (student view).
'use client'

import { useParams } from 'next/navigation'
import { StudentTicketThread } from '@/components/support/StudentTicketThread'

export default function SupportTicketDetailPage() {
  const params = useParams<{ id: string }>()
  return (
    <div className="mx-auto max-w-3xl">
      <StudentTicketThread ticketId={params.id} />
    </div>
  )
}
