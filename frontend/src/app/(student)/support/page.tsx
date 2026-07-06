// Domain: Support
// Description: Support Center landing (S1). Entry points to the available support
//   surfaces — Book a Teacher and My Sessions. More surfaces (Ask a Question,
//   Office Hours) land in later slices.
'use client'

import Link from 'next/link'
import { CalendarClock, CalendarPlus, ClipboardList, MessageSquarePlus } from 'lucide-react'
import { useT } from '@/lib/i18n/I18nProvider'
import { Card, CardContent } from '@/components/ui/card'
import { SupportSummaryStrip } from '@/components/support/SupportSummaryStrip'

const TILES = [
  {
    href: '/support/book',
    icon: CalendarPlus,
    titleKey: 'support.landing.bookTitle',
    descKey: 'support.landing.bookDesc',
  },
  {
    href: '/support/sessions',
    icon: ClipboardList,
    titleKey: 'support.landing.sessionsTitle',
    descKey: 'support.landing.sessionsDesc',
  },
  {
    href: '/support/tickets',
    icon: MessageSquarePlus,
    titleKey: 'support.landing.askTitle',
    descKey: 'support.landing.askDesc',
  },
  {
    href: '/support/office-hours',
    icon: CalendarClock,
    titleKey: 'support.landing.officeHoursTitle',
    descKey: 'support.landing.officeHoursDesc',
  },
] as const

export default function SupportPage() {
  const t = useT()
  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t('support.title')}</h1>
        <p className="text-muted-foreground">{t('support.subtitle')}</p>
      </div>
      <SupportSummaryStrip />
      <div className="grid gap-4 sm:grid-cols-2">
        {TILES.map((tile) => {
          const Icon = tile.icon
          return (
            <Link key={tile.href} href={tile.href} className="group">
              <Card className="h-full transition-colors group-hover:border-primary">
                <CardContent className="flex flex-col gap-3 p-6">
                  <div className="flex h-11 w-11 items-center justify-center rounded-full bg-primary-50 text-primary-700 dark:bg-primary-800/40 dark:text-primary-100">
                    <Icon className="h-6 w-6" />
                  </div>
                  <h2 className="text-lg font-semibold">{t(tile.titleKey)}</h2>
                  <p className="text-sm text-muted-foreground">{t(tile.descKey)}</p>
                </CardContent>
              </Card>
            </Link>
          )
        })}
      </div>
    </div>
  )
}
