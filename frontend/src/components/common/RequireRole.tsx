// Domain: Common
// Description: Role-gated route guard on top of the auth guard. Unauthenticated
//   users go to /login (with ?next=); authenticated users whose role isn't
//   allowed are bounced to their dashboard. The API enforces roles server-side —
//   this only shapes navigation.
'use client'

import * as React from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { useAuth } from '@/lib/auth/AuthProvider'
import { FullPageSpinner } from '@/components/ui/spinner'
import type { UserRole } from '@/types'

export function RequireRole({
  roles,
  children,
}: {
  roles: UserRole[]
  children: React.ReactNode
}) {
  const { user, isAuthenticated, isLoading } = useAuth()
  const router = useRouter()
  const pathname = usePathname()

  const allowed = user !== null && roles.includes(user.role)

  React.useEffect(() => {
    if (isLoading) return
    if (!isAuthenticated) {
      router.replace(`/login?next=${encodeURIComponent(pathname)}`)
    } else if (!allowed) {
      router.replace('/dashboard')
    }
  }, [isLoading, isAuthenticated, allowed, pathname, router])

  if (isLoading) return <FullPageSpinner label="Loading…" />
  if (!allowed) return <FullPageSpinner />
  return <>{children}</>
}
