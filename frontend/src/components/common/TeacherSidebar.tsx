// Domain: Common
// Description: Left navigation for the teacher shell, plus a jump back to the
//   student-facing dashboard (teachers have full student access too).
'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  CalendarCheck,
  CalendarClock,
  ClipboardCheck,
  ClipboardList,
  Gauge,
  GraduationCap,
  HeartHandshake,
  LayoutDashboard,
  LifeBuoy,
  Table2,
  Users,
} from 'lucide-react'
import { cn } from '@/lib/utils/cn'
import { useT } from '@/lib/i18n/I18nProvider'
import { useAuth } from '@/lib/auth/AuthProvider'
import type { NavItem } from './Sidebar'

export const TEACHER_NAV: NavItem[] = [
  { labelKey: 'teacher.nav.dashboard', href: '/teacher/dashboard', icon: Gauge },
  { labelKey: 'teacher.nav.students', href: '/teacher/students', icon: GraduationCap },
  { labelKey: 'teacher.nav.classes', href: '/teacher/classes', icon: Users },
  { labelKey: 'teacher.nav.attendance', href: '/teacher/attendance', icon: CalendarCheck },
  { labelKey: 'teacher.nav.schedule', href: '/teacher/schedule', icon: CalendarClock },
  { labelKey: 'teacher.nav.homework', href: '/teacher/homework', icon: ClipboardList },
  { labelKey: 'teacher.nav.grading', href: '/teacher/grading', icon: ClipboardCheck },
  { labelKey: 'teacher.nav.gradebook', href: '/teacher/gradebook', icon: Table2 },
  { labelKey: 'teacher.nav.mentees', href: '/teacher/mentees', icon: HeartHandshake },
  { labelKey: 'teacher.nav.support', href: '/teacher/support', icon: LifeBuoy },
  // Availability + office-hours are self-service for teachers only (IsTeacher
  // endpoints); admins who share the teacher shell would 403, so hide from them.
  { labelKey: 'teacher.nav.availability', href: '/teacher/availability', icon: CalendarClock, teacherOnly: true },
  { labelKey: 'teacher.nav.officeHours', href: '/teacher/office-hours', icon: Users, teacherOnly: true },
]

/** Role-aware filter shared by the teacher sidebar and the mobile drawer. */
export function visibleTeacherNav(role: string | undefined): NavItem[] {
  return TEACHER_NAV.filter((item) => !item.teacherOnly || role === 'teacher')
}

export function TeacherSidebar() {
  const pathname = usePathname()
  const t = useT()
  const { user } = useAuth()
  const items = visibleTeacherNav(user?.role)

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
        {items.map((item) => {
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
