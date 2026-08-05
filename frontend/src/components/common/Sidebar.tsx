// Domain: Common
// Description: Left navigation for the student shell. Items may opt into a
//   disabled "Soon" tag (soon: true) for not-yet-built destinations, or into
//   academyOnly (hidden from public users — the API enforces server-side too).
'use client'

import * as React from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { BarChart3, BookOpen, ClipboardList, GraduationCap, LayoutDashboard, LifeBuoy, Presentation, Settings, Shield, Users } from 'lucide-react'
import { cn } from '@/lib/utils/cn'
import { useT } from '@/lib/i18n/I18nProvider'
import { useAuth } from '@/lib/auth/AuthProvider'
import { EXAM_TYPES } from '@/components/tests/examTypes'

export interface NavItem {
  labelKey: string
  href: string
  icon: React.ComponentType<{ className?: string }>
  soon?: boolean
  academyOnly?: boolean
  /** Teacher-shell items backed by IsTeacher-only endpoints (hidden from admins). */
  teacherOnly?: boolean
  /** Optional presentational section key (i18n `<nav>.sections.<key>`) for grouping. */
  section?: string
}

/** One nav entry per exam type. Mocks, midterms, past papers and assessments
 *  all existed in the backend and the admin, but the student shell only ever
 *  offered "Practice tests" — a single dashboard list hard-filtered to
 *  type=practice — so there was no route to any of the others. */
const TEST_NAV: NavItem[] = EXAM_TYPES.map((meta) => ({
  labelKey: `tests.types.${meta.key}.nav`,
  href: `/tests/${meta.slug}`,
  icon: meta.icon,
  academyOnly: meta.academyOnly,
  section: 'tests',
}))

export const STUDENT_NAV: NavItem[] = [
  { labelKey: 'nav.dashboard', href: '/dashboard', icon: LayoutDashboard },
  ...TEST_NAV,
  { labelKey: 'nav.classes', href: '/classes', icon: Users, academyOnly: true, section: 'study' },
  { labelKey: 'nav.questionBank', href: '/questions', icon: BookOpen, section: 'study' },
  { labelKey: 'nav.homework', href: '/homework', icon: ClipboardList, academyOnly: true, section: 'study' },
  { labelKey: 'nav.courses', href: '/courses', icon: GraduationCap, academyOnly: true, section: 'study' },
  { labelKey: 'nav.support', href: '/support', icon: LifeBuoy, academyOnly: true, section: 'study' },
  { labelKey: 'nav.analytics', href: '/analytics', icon: BarChart3, section: 'you' },
  { labelKey: 'nav.settings', href: '/settings', icon: Settings, section: 'you' },
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
  const isAdmin = user?.role === 'admin'

  return (
    <aside className="hidden w-sidebar shrink-0 border-r border-border bg-card md:block">
      <nav className="sticky top-16 flex flex-col gap-1 p-3">
        {(isTeacher || isAdmin) && (
          <>
            {isAdmin && (
              <Link
                href="/admin/users"
                className="flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted"
              >
                <Shield className="h-5 w-5" />
                {t('nav.adminPanel')}
              </Link>
            )}
            {isTeacher && (
              <Link
                href="/teacher/dashboard"
                className="flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted"
              >
                <Presentation className="h-5 w-5" />
                {t('nav.teacherPanel')}
              </Link>
            )}
            <div className="my-2 h-px bg-border" />
          </>
        )}
        {items.map((item, index) => {
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
          // A heading whenever the group changes — the list is long enough now
          // (five test types plus study and account items) to need the breaks.
          const heading =
            item.section && item.section !== items[index - 1]?.section ? (
              <p
                key={`${item.section}-heading`}
                className="px-3 pb-1 pt-4 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground"
              >
                {t(`nav.sections.${item.section}`)}
              </p>
            ) : null
          if (item.soon) {
            return (
              <React.Fragment key={item.href}>
                {heading}
                <span className="flex cursor-not-allowed items-center justify-between rounded-md px-3 py-2 text-sm text-muted-foreground/60">
                  <span className="flex items-center gap-3">
                    <Icon className="h-5 w-5" />
                    {t(item.labelKey)}
                  </span>
                  <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide">
                    {t('nav.soon')}
                  </span>
                </span>
              </React.Fragment>
            )
          }
          return (
            <React.Fragment key={item.href}>
              {heading}
              <Link
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
            </React.Fragment>
          )
        })}
      </nav>
    </aside>
  )
}
