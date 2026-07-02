// Domain: Common
// Description: Left navigation for the teacher shell, plus a jump back to the
//   student-facing dashboard (teachers have full student access too).
'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ClipboardList, LayoutDashboard, Users } from 'lucide-react'
import { cn } from '@/lib/utils/cn'
import { useT } from '@/lib/i18n/I18nProvider'

interface NavItem {
  labelKey: string
  href: string
  icon: React.ComponentType<{ className?: string }>
}

const NAV: NavItem[] = [
  { labelKey: 'teacher.nav.classes', href: '/teacher/classes', icon: Users },
  { labelKey: 'teacher.nav.homework', href: '/teacher/homework', icon: ClipboardList },
]

export function TeacherSidebar() {
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
        {NAV.map((item) => {
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
          {t('teacher.nav.studentView')}
        </Link>
      </nav>
    </aside>
  )
}
