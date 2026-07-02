// Domain: Teacher
// Description: Role-guarded teacher shell — Navbar + teacher Sidebar + content.
//   Teachers and admins only; students/public users are bounced to /dashboard.
import { RequireRole } from '@/components/common/RequireRole'
import { Navbar } from '@/components/common/Navbar'
import { TeacherSidebar } from '@/components/common/TeacherSidebar'

export default function TeacherLayout({ children }: { children: React.ReactNode }) {
  return (
    <RequireRole roles={['teacher', 'admin']}>
      <div className="min-h-screen">
        <Navbar />
        <div className="flex">
          <TeacherSidebar />
          <main className="min-w-0 flex-1 px-4 py-6 md:px-8 md:py-8">{children}</main>
        </div>
      </div>
    </RequireRole>
  )
}
