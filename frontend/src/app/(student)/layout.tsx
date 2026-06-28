// Domain: Student
// Description: Authenticated student shell — Navbar + Sidebar + content.
import { RequireAuth } from '@/components/common/RequireAuth'
import { Navbar } from '@/components/common/Navbar'
import { Sidebar } from '@/components/common/Sidebar'

export default function StudentLayout({ children }: { children: React.ReactNode }) {
  return (
    <RequireAuth>
      <div className="min-h-screen">
        <Navbar />
        <div className="flex">
          <Sidebar />
          <main className="min-w-0 flex-1 px-4 py-6 md:px-8 md:py-8">{children}</main>
        </div>
      </div>
    </RequireAuth>
  )
}
