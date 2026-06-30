// Domain: All
// Description: Themed 404 (replaces Next.js's unstyled default not-found page).
'use client'

import Link from 'next/link'
import { Compass } from 'lucide-react'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils/cn'
import { useT } from '@/lib/i18n/I18nProvider'

export default function NotFound() {
  const t = useT()
  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center gap-6 p-6 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-muted">
        <Compass className="h-8 w-8 text-muted-foreground" />
      </div>
      <div className="space-y-1">
        <p className="text-sm font-semibold uppercase tracking-wide text-primary">404</p>
        <h1 className="text-2xl font-bold">{t('errors.notFoundTitle')}</h1>
        <p className="max-w-sm text-muted-foreground">{t('errors.notFoundBody')}</p>
      </div>
      <Link href="/dashboard" className={cn(buttonVariants())}>
        {t('common.backToDashboard')}
      </Link>
    </div>
  )
}
