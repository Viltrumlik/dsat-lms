// Domain: Courses (student)
// Description: A student's assigned courses as cards, each showing completion progress.
'use client'

import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import { GraduationCap } from 'lucide-react'
import { coursesAPI } from '@/lib/api/courses'
import { useI18n } from '@/lib/i18n/I18nProvider'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'

export function CoursesBrowse() {
  const { t } = useI18n()
  const query = useQuery({ queryKey: ['courses'], queryFn: () => coursesAPI.list() })
  const courses = query.data ?? []

  if (query.isLoading) {
    return (
      <div className="grid gap-4 sm:grid-cols-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i}>
            <CardContent className="p-5">
              <div className="h-24 animate-pulse rounded bg-muted" />
            </CardContent>
          </Card>
        ))}
      </div>
    )
  }

  if (query.isError) {
    return (
      <Card>
        <CardContent className="flex flex-wrap items-center justify-between gap-3 p-5 text-sm text-muted-foreground">
          {t('courses.loadFailed')}
          <Button variant="outline" size="sm" onClick={() => query.refetch()}>
            {t('common.tryAgain')}
          </Button>
        </CardContent>
      </Card>
    )
  }

  if (courses.length === 0) {
    return (
      <Card>
        <CardContent className="p-10 text-center text-sm text-muted-foreground">
          {t('courses.empty')}
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {courses.map((c) => (
        <Link key={c.id} href={`/courses/${c.id}`} className="group">
          <Card className="h-full transition-colors group-hover:border-primary">
            <CardContent className="space-y-3 p-5">
              <div className="flex items-start gap-3">
                <div className="rounded-lg bg-primary-50 p-2 text-primary-700 dark:bg-primary-800/40 dark:text-primary-100">
                  <GraduationCap className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="truncate font-semibold">{c.title}</h3>
                  {c.description && (
                    <p className="line-clamp-2 text-sm text-muted-foreground">{c.description}</p>
                  )}
                </div>
              </div>
              <div className="space-y-1">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>
                    {t('courses.lessonsDone', { done: c.completed, total: c.total })}
                  </span>
                  <span className="tabular-nums">{c.completionPct}%</span>
                </div>
                <Progress value={c.completionPct} />
              </div>
            </CardContent>
          </Card>
        </Link>
      ))}
    </div>
  )
}
