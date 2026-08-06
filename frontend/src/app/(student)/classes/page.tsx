// Domain: Academy (classroom)
// Description: The student's own classes — the way in to each class stream.
'use client'

import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import { Users } from 'lucide-react'
import { classesAPI } from '@/lib/api/classes'
import { useT } from '@/lib/i18n/I18nProvider'
import { Card, CardContent } from '@/components/ui/card'

export default function ClassesPage() {
  const t = useT()
  const { data, isLoading } = useQuery({ queryKey: ['my-classes'], queryFn: classesAPI.mine })

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t('classroom.title')}</h1>
        <p className="text-muted-foreground">{t('classroom.subtitle')}</p>
      </div>

      {isLoading && <div className="h-24 animate-pulse rounded-xl bg-muted" />}

      {data && data.length === 0 && (
        <Card>
          <CardContent className="p-10 text-center text-sm text-muted-foreground">
            {t('classroom.noClasses')}
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        {data?.map((klass) => (
          <Link key={klass.id} href={`/classes/${klass.id}`}>
            <Card className="transition-colors hover:border-primary-300">
              <CardContent className="flex items-center gap-3 p-5">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary-50 text-primary-700 dark:bg-primary-800/40 dark:text-primary-100">
                  <Users className="h-5 w-5" />
                </span>
                <div className="min-w-0">
                  <p className="truncate font-semibold">{klass.name}</p>
                  <p className="truncate text-sm text-muted-foreground">
                    {klass.teacherName}
                    {klass.teacherName && ' · '}
                    {t('classroom.studentCount', { count: klass.studentCount })}
                  </p>
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  )
}
