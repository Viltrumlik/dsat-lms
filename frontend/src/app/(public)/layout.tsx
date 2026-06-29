// Domain: Public (auth)
// Description: Centered, branded shell for auth pages. Carries the language +
//   theme switchers so unauthenticated visitors can set both before signing in.
'use client'

import Link from 'next/link'
import { GraduationCap } from 'lucide-react'
import { useT } from '@/lib/i18n/I18nProvider'
import { LanguageSwitcher } from '@/components/common/LanguageSwitcher'
import { ThemeToggle } from '@/components/common/ThemeToggle'

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  const t = useT()
  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center bg-gradient-to-b from-muted/40 to-background px-4 py-12">
      <div className="absolute right-4 top-4 flex items-center gap-1">
        <LanguageSwitcher />
        <ThemeToggle />
      </div>
      <div className="w-full max-w-md">
        <Link href="/" className="mb-8 flex items-center justify-center gap-2">
          <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <GraduationCap className="h-6 w-6" />
          </span>
          <span className="text-xl font-bold tracking-tight">DSAT LMS</span>
        </Link>
        {children}
      </div>
      <p className="mt-8 text-center text-xs text-muted-foreground">{t('common.tagline')}</p>
    </div>
  )
}
