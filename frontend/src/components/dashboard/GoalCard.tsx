// Domain: Student
// Description: Surfaces the SAT goals set in Settings — target score + an exam-date
//   countdown. When neither is set it becomes a gentle nudge to /settings, so the
//   profile fields we collect are actually visible/actionable on the dashboard.
'use client'

import Link from 'next/link'
import { differenceInCalendarDays, format } from 'date-fns'
import { uz as uzDate } from 'date-fns/locale'
import { CalendarClock, Target } from 'lucide-react'
import { useAuth } from '@/lib/auth/AuthProvider'
import { useI18n, plural } from '@/lib/i18n/I18nProvider'
import { Card, CardContent } from '@/components/ui/card'
import { parseExamDate } from '@/lib/utils/examDate'
import type { Locale } from '@/lib/i18n/config'

function daysLabel(examDate: Date, locale: Locale, t: ReturnType<typeof useI18n>['t']) {
  const days = differenceInCalendarDays(examDate, new Date())
  if (days < 0) return t('dashboard.goal.examPassed')
  if (days === 0) return t('dashboard.goal.examToday')
  return plural(
    locale,
    days,
    t('dashboard.goal.daysToGoOne', { count: days }),
    t('dashboard.goal.daysToGoOther', { count: days })
  )
}

export function GoalCard() {
  const { user } = useAuth()
  const { t, locale } = useI18n()
  if (!user) return null

  const hasScore = user.satTargetScore != null
  const examDate = user.examDate ? parseExamDate(user.examDate) : null
  const dateLocale = locale === 'uz' ? uzDate : undefined

  // Nothing usable set yet — nudge toward Settings rather than showing an empty card.
  if (!hasScore && !examDate) {
    return (
      <Card>
        <CardContent className="flex flex-col gap-2 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-primary-50 text-primary-700 dark:bg-primary-800/40 dark:text-primary-100">
              <Target className="h-5 w-5" />
            </span>
            <p className="text-sm text-muted-foreground">{t('dashboard.goal.emptyPrompt')}</p>
          </div>
          <Link
            href="/settings"
            className="text-sm font-medium text-primary hover:underline"
          >
            {t('dashboard.goal.setGoal')}
          </Link>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardContent className="flex flex-col gap-5 p-5 sm:flex-row sm:items-center sm:gap-10">
        {hasScore && (
          <div className="flex items-center gap-4">
            <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-primary-50 text-primary-700 dark:bg-primary-800/40 dark:text-primary-100">
              <Target className="h-5 w-5" />
            </span>
            <div>
              <p className="text-2xl font-bold leading-tight tabular-nums">
                {user.satTargetScore}
              </p>
              <p className="text-sm text-muted-foreground">{t('dashboard.goal.targetScore')}</p>
            </div>
          </div>
        )}
        {examDate && (
          <div className="flex items-center gap-4">
            <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-primary-50 text-primary-700 dark:bg-primary-800/40 dark:text-primary-100">
              <CalendarClock className="h-5 w-5" />
            </span>
            <div>
              <p className="text-2xl font-bold leading-tight">{daysLabel(examDate, locale, t)}</p>
              <p className="text-sm text-muted-foreground">
                {t('dashboard.goal.examOn', {
                  date: format(examDate, 'PP', { locale: dateLocale }),
                })}
              </p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
