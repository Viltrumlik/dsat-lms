// Domain: Support (teacher)
// Description: Teacher support hub — two tabs: 1:1 Sessions (bookings) and
//   Questions (the shared ticket queue). Honors ?tab=questions from the
//   support_reply notification deep-link.
'use client'

import * as React from 'react'
import { useT } from '@/lib/i18n/I18nProvider'
import { cn } from '@/lib/utils/cn'
import { StaffBookings } from '@/components/support/StaffBookings'
import { StaffTickets } from '@/components/support/StaffTickets'

type Tab = 'sessions' | 'questions'

export default function TeacherSupportPage() {
  const t = useT()
  const [tab, setTab] = React.useState<Tab>('sessions')

  // Deep-link support (?tab=questions) — read client-side to avoid pulling
  // useSearchParams into the static build.
  React.useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('tab') === 'questions') setTab('questions')
  }, [])

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t('teacher.support.title')}</h1>
        <p className="text-muted-foreground">{t('teacher.support.subtitle')}</p>
      </div>

      <div className="flex gap-1 border-b border-border">
        {(['sessions', 'questions'] as Tab[]).map((value) => (
          <button
            key={value}
            onClick={() => setTab(value)}
            className={cn(
              '-mb-px border-b-2 px-4 py-2 text-sm font-medium transition-colors',
              tab === value
                ? 'border-primary text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            )}
          >
            {t(`teacher.support.tab.${value}`)}
          </button>
        ))}
      </div>

      {tab === 'sessions' ? <StaffBookings /> : <StaffTickets />}
    </div>
  )
}
