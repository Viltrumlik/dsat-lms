// Domain: Common
// Description: Mobile navigation — hamburger (hidden ≥md, where the sidebars
//   take over) opening a left drawer with the role-aware nav items. Shows the
//   teacher items inside /teacher/*, the student items elsewhere.
'use client'

import * as React from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import { GraduationCap, LayoutDashboard, Menu, Presentation, Shield, X } from 'lucide-react'
import { cn } from '@/lib/utils/cn'
import { useT } from '@/lib/i18n/I18nProvider'
import { useAuth } from '@/lib/auth/AuthProvider'
import { Button } from '@/components/ui/button'
import { visibleStudentNav, type NavItem } from './Sidebar'
import { visibleTeacherNav } from './TeacherSidebar'
import { ADMIN_NAV } from './AdminSidebar'

export function MobileNav() {
  const [open, setOpen] = React.useState(false)
  const pathname = usePathname()
  const { user } = useAuth()
  const t = useT()

  const inTeacherArea = pathname.startsWith('/teacher')
  const inAdminArea = pathname.startsWith('/admin')
  const isTeacher = user?.role === 'teacher' || user?.role === 'admin'
  const isAdmin = user?.role === 'admin'

  const items: NavItem[] = inAdminArea
    ? [
        ...ADMIN_NAV,
        { labelKey: 'admin.nav.studentView', href: '/dashboard', icon: LayoutDashboard },
      ]
    : inTeacherArea
      ? [
          ...visibleTeacherNav(user?.role),
          { labelKey: 'teacher.nav.studentView', href: '/dashboard', icon: LayoutDashboard },
        ]
      : [
          ...(isAdmin
            ? [{ labelKey: 'nav.adminPanel', href: '/admin/users', icon: Shield }]
            : []),
          ...(isTeacher
            ? [{ labelKey: 'nav.teacherPanel', href: '/teacher/dashboard', icon: Presentation }]
            : []),
          ...visibleStudentNav(user?.role),
        ]

  return (
    <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
      <DialogPrimitive.Trigger asChild>
        <Button variant="ghost" size="icon" className="md:hidden" aria-label={t('nav.openMenu')}>
          <Menu className="h-5 w-5" />
        </Button>
      </DialogPrimitive.Trigger>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm data-[state=open]:animate-fade-in md:hidden" />
        <DialogPrimitive.Content className="fixed inset-y-0 left-0 z-50 flex w-72 max-w-[85vw] flex-col border-r border-border bg-card p-4 shadow-xl data-[state=open]:animate-slide-in-left md:hidden">
          <DialogPrimitive.Title className="sr-only">{t('nav.openMenu')}</DialogPrimitive.Title>
          <div className="mb-4 flex items-center justify-between">
            <span className="flex items-center gap-2 font-bold tracking-tight">
              <GraduationCap className="h-5 w-5 text-primary" /> {t('common.appName')}
            </span>
            <DialogPrimitive.Close asChild>
              <Button variant="ghost" size="icon" aria-label={t('nav.closeMenu')}>
                <X className="h-5 w-5" />
              </Button>
            </DialogPrimitive.Close>
          </div>
          <nav className="flex flex-col gap-1">
            {items
              .filter((item) => !item.soon)
              .map((item) => {
                const base = item.href.split('#')[0]
                const active =
                  !item.href.includes('#') &&
                  (pathname === base ||
                    (base !== '/admin' && pathname.startsWith(base + '/')))
                const Icon = item.icon
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setOpen(false)}
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
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}
