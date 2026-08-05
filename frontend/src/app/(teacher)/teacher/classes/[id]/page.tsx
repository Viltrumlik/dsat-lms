// Domain: Academy (teacher)
// Description: A class, as its teacher opens it — the SAME workspace the student
//   sees. What differs comes from the server's capabilities, not from this file:
//   the composer appears, hand-in counts appear, the roster gains the enrol form.
//   /teacher/classes/ stays the management list (create a class); being in a
//   class is a different job from administering one.
'use client'

import { ClassWorkspace } from '@/components/classroom/ClassWorkspace'

export default function TeacherClassPage({ params }: { params: { id: string } }) {
  return <ClassWorkspace classId={params.id} backHref="/teacher/classes" />
}
