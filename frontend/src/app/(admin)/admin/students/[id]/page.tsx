// Domain: Admin (CRM)
// Description: The Student-360 profile.
'use client'

import { Student360 } from '@/components/admin/Student360'

export default function AdminStudent360Page({ params }: { params: { id: string } }) {
  return (
    <div className="mx-auto max-w-5xl">
      <Student360 studentId={params.id} />
    </div>
  )
}
