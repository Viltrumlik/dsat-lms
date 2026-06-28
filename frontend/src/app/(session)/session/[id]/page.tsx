// Domain: Test Engine
// Description: Loads a session into the store (server wins) then renders the
//   fullscreen TestShell. Handles loading / not-found states.
'use client'

import Link from 'next/link'
import { AlertCircle } from 'lucide-react'
import { useSession } from '@/lib/hooks/useSession'
import { TestShell } from '@/components/test-engine/TestShell'
import { FullPageSpinner } from '@/components/ui/spinner'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils/cn'

export default function SessionPage({ params }: { params: { id: string } }) {
  const { state } = useSession(params.id)

  if (state === 'loading' || state === 'redirecting') {
    return <FullPageSpinner label="Loading your test…" />
  }

  if (state === 'error') {
    return (
      <div className="flex min-h-[100dvh] flex-col items-center justify-center gap-4 p-6 text-center">
        <AlertCircle className="h-12 w-12 text-error" />
        <div>
          <h1 className="text-xl font-bold">Couldn&apos;t open this test</h1>
          <p className="mt-1 text-muted-foreground">
            The session may have ended, been submitted, or doesn&apos;t exist.
          </p>
        </div>
        <Link href="/dashboard" className={cn(buttonVariants())}>
          Back to dashboard
        </Link>
      </div>
    )
  }

  return <TestShell />
}
