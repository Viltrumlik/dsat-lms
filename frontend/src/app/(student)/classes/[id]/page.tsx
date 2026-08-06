// Domain: Academy (classroom)
// Description: A class, as a student opens it. Access is membership-scoped
//   server-side — a class they are not in 404s, so there is no client guard.
'use client'

import { ClassWorkspace } from '@/components/classroom/ClassWorkspace'

export default function ClassPage({ params }: { params: { id: string } }) {
  return <ClassWorkspace classId={params.id} backHref="/classes" />
}
