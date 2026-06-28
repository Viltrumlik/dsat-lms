// Domain: Common
// Description: Top navigation bar for the student shell.
'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { GraduationCap, LogOut } from 'lucide-react'
import { useAuth } from '@/lib/auth/AuthProvider'
import { Button } from '@/components/ui/button'
import { ThemeToggle } from './ThemeToggle'

function initials(first: string, last: string) {
  return `${first[0] ?? ''}${last[0] ?? ''}`.toUpperCase() || '?'
}

export function Navbar() {
  const { user, logout } = useAuth()
  const router = useRouter()

  const onLogout = async () => {
    await logout()
    router.replace('/login')
  }

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-border bg-card/80 px-4 backdrop-blur md:px-6">
      <Link href="/dashboard" className="flex items-center gap-2">
        <span className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
          <GraduationCap className="h-5 w-5" />
        </span>
        <span className="text-lg font-bold tracking-tight">DSAT LMS</span>
      </Link>

      <div className="flex items-center gap-2">
        <ThemeToggle />
        {user && (
          <div className="flex items-center gap-3 pl-2">
            <div className="hidden text-right sm:block">
              <p className="text-sm font-medium leading-tight">{user.fullName}</p>
              <p className="text-xs capitalize text-muted-foreground">{user.role}</p>
            </div>
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary-100 text-sm font-semibold text-primary-700">
              {initials(user.firstName, user.lastName)}
            </span>
            <Button variant="ghost" size="icon" aria-label="Sign out" onClick={onLogout}>
              <LogOut className="h-5 w-5" />
            </Button>
          </div>
        )}
      </div>
    </header>
  )
}
