// Domain: Common
// Description: Left navigation for the student shell. Items may opt into a
//   disabled "Soon" tag (soon: true) for not-yet-built destinations, or into
//   academyOnly (hidden from public users — the API enforces server-side too).
'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { BarChart3, BookOpen, ClipboardList, LayoutDashboard, ListChecks, Presentation } from 'lucide-react'
import { cn } from '@/lib/utils/cn'
import { useT } from '@/lib/i18n/I18nProvider'
import { useAuth } from '@/lib/auth/AuthProvider'

export interface NavItem {
  labelKey: string
  href: string
  icon: React.ComponentType<{ className?: string }>
  soon?: boolean
  academyOnly?: boolean
}

export const STUDENT_NAV: NavItem[] = [
  { labelKey: 'nav.dashboard', href: '/dashboard', icon: LayoutDashboard },
  { labelKey: 'nav.practiceTests', href: '/dashboard#tests', icon: ListChecks },
  { labelKey: 'nav.questionBank', href: '/questions', icon: BookOpen },
  { labelKey: 'nav.homework', href: '/homework', icon: ClipboardList, academyOnly: true },
  { labelKey: 'nav.analytics', href: '/analytics', icon: BarChart3 },
]

/** Role-aware filter shared by the sidebar and the mobile drawer. */
export function visibleStudentNav(role: string | undefined): NavItem[] {
  return STUDENT_NAV.filter((item) => !item.academyOnly || (role && role !== 'public'))
}

export function Sidebar() {
  const pathname = usePathname()
  const t = useT()
  const { user } = useAuth()

  const items = visibleStudentNav(user?.role)
  const isTeacher = user?.role === 'teacher' || user?.role === 'admin'

  return (
    <aside className="hidden w-sidebar shrink-0 border-r border-border bg-card md:block">
      <nav className="sticky top-16 flex flex-col gap-1 p-3">
        {isTeacher && (
          <>
            <Link
              href="/teacher/classes"
              className="flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted"
            >
              <Presentation className="h-5 w-5" />
              {t('nav.teacherPanel')}
            </Link>
            <div className="my-2 h-px bg-border" />
          </>
        )}
        {items.map((item) => {
          // In-page anchors (href contains '#') share a pathname with the page
          // they scroll within, so they must not compete for the active state —
          // only the real page link (no hash) highlights. Nested routes (e.g.
          // /questions/:id) keep their section's nav item active.
          const base = item.href.split('#')[0]
          const active =
            !item.soon &&
            !item.href.includes('#') &&
            (pathname === base || pathname.startsWith(base + '/'))
          const Icon = item.icon
          if (item.soon) {
            return (
              <span
                key={item.href}
                className="flex cursor-not-allowed items-center justify-between rounded-md px-3 py-2 text-sm text-muted-foreground/60"
              >
                <span className="flex items-center gap-3">
                  <Icon className="h-5 w-5" />
                  {t(item.labelKey)}
                </span>
                <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide">
                  {t('nav.soon')}
                </span>
              </span>
            )
          }
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                active
                  ? 'bg-primary-50 text-primary-700 dark:bg-primary-800/40 dark:text-primary-100'
                  : 'text-foreground hover:bg-muted'
              )}
            >
              <Icon className="h-5 w-5" />
              {t(item.labelKey)}
            </Link>
          )
        })}
      </nav>
    </aside>
  )
}
