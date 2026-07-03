// Domain: Admin
// Description: Role-guarded admin shell — Navbar + admin Sidebar + content.
//   Admins only; everyone else is bounced to /dashboard by RequireRole.
import { RequireRole } from '@/components/common/RequireRole'
import { Navbar } from '@/components/common/Navbar'
import { AdminSidebar } from '@/components/common/AdminSidebar'

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <RequireRole roles={['admin']}>
      <div className="min-h-screen">
        <Navbar />
        <div className="flex">
          <AdminSidebar />
          <main className="min-w-0 flex-1 px-4 py-6 md:px-8 md:py-8">{children}</main>
        </div>
      </div>
    </RequireRole>
  )
}
