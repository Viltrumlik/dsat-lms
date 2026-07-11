// Domain: Common
// Description: Left navigation for the admin shell, plus a jump back to the
//   student-facing dashboard (admins have full student access too).
'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  CalendarClock,
  ClipboardList,
  FileText,
  LayoutDashboard,
  LifeBuoy,
  Settings,
  Users,
} from 'lucide-react'
import { cn } from '@/lib/utils/cn'
import { useT } from '@/lib/i18n/I18nProvider'
import type { NavItem } from './Sidebar'

export const ADMIN_NAV: NavItem[] = [
  { labelKey: 'admin.nav.users', href: '/admin/users', icon: Users },
  { labelKey: 'admin.nav.questions', href: '/admin/questions', icon: FileText },
  { labelKey: 'admin.nav.exams', href: '/admin/exams', icon: ClipboardList },
  { labelKey: 'admin.nav.assignments', href: '/admin/assignments', icon: CalendarClock },
  { labelKey: 'admin.nav.supportOps', href: '/admin/support-ops', icon: LifeBuoy },
  { labelKey: 'admin.nav.settings', href: '/admin/settings', icon: Settings },
]

export function AdminSidebar() {
  const pathname = usePathname()
  const t = useT()

  const linkClass = (active: boolean) =>
    cn(
      'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
      active
        ? 'bg-primary-50 text-primary-700 dark:bg-primary-800/40 dark:text-primary-100'
        : 'text-foreground hover:bg-muted'
    )

  return (
    <aside className="hidden w-sidebar shrink-0 border-r border-border bg-card md:block">
      <nav className="sticky top-16 flex flex-col gap-1 p-3">
        {ADMIN_NAV.map((item) => {
          const Icon = item.icon
          const active = pathname === item.href || pathname.startsWith(item.href + '/')
          return (
            <Link key={item.href} href={item.href} className={linkClass(active)}>
              <Icon className="h-5 w-5" />
              {t(item.labelKey)}
            </Link>
          )
        })}
        <div className="my-2 h-px bg-border" />
        <Link href="/dashboard" className={linkClass(false)}>
          <LayoutDashboard className="h-5 w-5" />
          {t('admin.nav.studentView')}
        </Link>
      </nav>
    </aside>
  )
}
