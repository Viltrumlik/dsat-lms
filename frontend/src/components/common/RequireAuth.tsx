// Domain: Common
// Description: Client-side route guard. Redirects unauthenticated users to /login
//   (with a ?next= back-link). Used by the (student) and (session) layouts.
'use client'

import * as React from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { useAuth } from '@/lib/auth/AuthProvider'
import { FullPageSpinner } from '@/components/ui/spinner'

export function RequireAuth({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth()
  const router = useRouter()
  const pathname = usePathname()

  React.useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.replace(`/login?next=${encodeURIComponent(pathname)}`)
    }
  }, [isLoading, isAuthenticated, pathname, router])

  if (isLoading) return <FullPageSpinner label="Loading…" />
  if (!isAuthenticated) return <FullPageSpinner />
  return <>{children}</>
}
