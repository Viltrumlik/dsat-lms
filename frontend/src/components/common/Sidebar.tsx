// Domain: Common
// Description: Left navigation for the student shell. Phase-2 destinations are
//   shown disabled with a "Soon" tag.
'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { BarChart3, BookOpen, LayoutDashboard, ListChecks } from 'lucide-react'
import { cn } from '@/lib/utils/cn'

interface NavItem {
  label: string
  href: string
  icon: React.ComponentType<{ className?: string }>
  soon?: boolean
}

const NAV: NavItem[] = [
  { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { label: 'Practice Tests', href: '/dashboard#tests', icon: ListChecks },
  { label: 'Question Bank', href: '/questions', icon: BookOpen },
  { label: 'Analytics', href: '#', icon: BarChart3, soon: true },
]

export function Sidebar() {
  const pathname = usePathname()

  return (
    <aside className="hidden w-sidebar shrink-0 border-r border-border bg-card md:block">
      <nav className="sticky top-16 flex flex-col gap-1 p-3">
        {NAV.map((item) => {
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
                key={item.label}
                className="flex cursor-not-allowed items-center justify-between rounded-md px-3 py-2 text-sm text-muted-foreground/60"
              >
                <span className="flex items-center gap-3">
                  <Icon className="h-5 w-5" />
                  {item.label}
                </span>
                <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide">
                  Soon
                </span>
              </span>
            )
          }
          return (
            <Link
              key={item.label}
              href={item.href}
              className={cn(
                'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                active
                  ? 'bg-primary-50 text-primary-700 dark:bg-primary-800/40 dark:text-primary-100'
                  : 'text-foreground hover:bg-muted'
              )}
            >
              <Icon className="h-5 w-5" />
              {item.label}
            </Link>
          )
        })}
      </nav>
    </aside>
  )
}
