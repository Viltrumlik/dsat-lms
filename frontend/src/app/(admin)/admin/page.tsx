// Domain: Admin
// Description: /admin index → redirect to the user-management page.
import { redirect } from 'next/navigation'

export default function AdminIndexPage() {
  redirect('/admin/users')
}
