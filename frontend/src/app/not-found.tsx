// Domain: All
// Description: Themed 404 (replaces Next.js's unstyled default not-found page).
import Link from 'next/link'
import { Compass } from 'lucide-react'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils/cn'

export const metadata = { title: 'Page not found' }

export default function NotFound() {
  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center gap-6 p-6 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-muted">
        <Compass className="h-8 w-8 text-muted-foreground" />
      </div>
      <div className="space-y-1">
        <p className="text-sm font-semibold uppercase tracking-wide text-primary">404</p>
        <h1 className="text-2xl font-bold">Page not found</h1>
        <p className="max-w-sm text-muted-foreground">
          The page you&apos;re looking for doesn&apos;t exist or may have moved.
        </p>
      </div>
      <Link href="/dashboard" className={cn(buttonVariants())}>
        Back to dashboard
      </Link>
    </div>
  )
}
