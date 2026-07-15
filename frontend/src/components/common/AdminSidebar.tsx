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
  Megaphone,
  ScrollText,
  Settings,
  Table2,
  Users,
} from 'lucide-react'
import { cn } from '@/lib/utils/cn'
import { useT } from '@/lib/i18n/I18nProvider'
import type { NavItem } from './Sidebar'

export const ADMIN_NAV: NavItem[] = [
  { labelKey: 'admin.nav.dashboard', href: '/admin', icon: LayoutDashboard, section: 'overview' },
  { labelKey: 'admin.nav.users', href: '/admin/users', icon: Users, section: 'people' },
  { labelKey: 'admin.nav.questions', href: '/admin/questions', icon: FileText, section: 'content' },
  { labelKey: 'admin.nav.exams', href: '/admin/exams', icon: ClipboardList, section: 'content' },
  {
    labelKey: 'admin.nav.assignments',
    href: '/admin/assignments',
    icon: CalendarClock,
    section: 'content',
  },
  { labelKey: 'admin.nav.gradebook', href: '/admin/gradebook', icon: Table2, section: 'content' },
  {
    labelKey: 'admin.nav.announcements',
    href: '/admin/announcements',
    icon: Megaphone,
    section: 'communication',
  },
  {
    labelKey: 'admin.nav.supportOps',
    href: '/admin/support-ops',
    icon: LifeBuoy,
    section: 'support',
  },
  { labelKey: 'admin.nav.audit', href: '/admin/audit', icon: ScrollText, section: 'system' },
  { labelKey: 'admin.nav.settings', href: '/admin/settings', icon: Settings, section: 'system' },
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
        {ADMIN_NAV.map((item, i) => {
          const Icon = item.icon
          // '/admin' is the index route — match it exactly so it doesn't stay
          // active on every /admin/* sub-page.
          const active =
            pathname === item.href ||
            (item.href !== '/admin' && pathname.startsWith(item.href + '/'))
          // Presentational section header when the section changes.
          const showHeader = item.section && item.section !== ADMIN_NAV[i - 1]?.section
          return (
            <div key={item.href}>
              {showHeader && (
                <p className="px-3 pb-1 pt-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {t(`admin.nav.sections.${item.section}`)}
                </p>
              )}
              <Link href={item.href} className={linkClass(active)}>
                <Icon className="h-5 w-5" />
                {t(item.labelKey)}
              </Link>
            </div>
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
