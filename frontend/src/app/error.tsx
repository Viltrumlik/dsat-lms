// Domain: All
// Description: Themed root error boundary (App Router). Catches render/runtime
//   errors in the app tree, logs them, and offers a retry + escape hatch.
'use client'

import * as React from 'react'
import Link from 'next/link'
import { AlertTriangle } from 'lucide-react'
import { Button, buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils/cn'

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  React.useEffect(() => {
    // Surface in the console during dev; a Sentry capture can hook in here later.
    console.error(error)
  }, [error])

  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center gap-6 p-6 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-error/10">
        <AlertTriangle className="h-8 w-8 text-error" />
      </div>
      <div className="space-y-1">
        <h1 className="text-2xl font-bold">Something went wrong</h1>
        <p className="max-w-sm text-muted-foreground">
          An unexpected error occurred. You can try again, or head back to your dashboard.
        </p>
      </div>
      <div className="flex items-center gap-3">
        <Button onClick={reset}>Try again</Button>
        <Link href="/dashboard" className={cn(buttonVariants({ variant: 'outline' }))}>
          Back to dashboard
        </Link>
      </div>
    </div>
  )
}
