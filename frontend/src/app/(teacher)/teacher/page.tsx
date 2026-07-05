// Domain: Academy (teacher)
// Description: /teacher → the teacher dashboard.
import { redirect } from 'next/navigation'

export default function TeacherIndexPage() {
  redirect('/teacher/dashboard')
}
