// Domain: Academy (classroom)
// Description: The class page — Stream · Classwork · People, the way Google
//   Classroom lays a class out.
//
// ONE component for both roles. The teacher and the student open the same
// screen; what differs comes from the server's `capabilities`, never from a
// role string read on the client. Two copies of this screen would be two things
// to keep in step forever, and the difference between them is small: who may
// post, who sees hand-in counts, who sees addresses.
'use client'

import * as React from 'react'
import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, ClipboardList, MessageSquare, Users } from 'lucide-react'
import { classesAPI } from '@/lib/api/classes'
import { useT } from '@/lib/i18n/I18nProvider'
import { cn } from '@/lib/utils/cn'
import { Spinner } from '@/components/ui/spinner'
import { ClassStream } from './ClassStream'
import { ClassworkTab } from './ClassworkTab'
import { PeopleTab } from './PeopleTab'

type TabId = 'stream' | 'classwork' | 'people'

const TABS: { id: TabId; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: 'stream', icon: MessageSquare },
  { id: 'classwork', icon: ClipboardList },
  { id: 'people', icon: Users },
]

export function ClassWorkspace({ classId, backHref }: { classId: string; backHref: string }) {
  const t = useT()
  const [tab, setTab] = React.useState<TabId>('stream')

  const klass = useQuery({
    queryKey: ['class', classId],
    queryFn: () => classesAPI.detail(classId),
  })

  if (klass.isLoading) {
    return (
      <div className="flex justify-center py-16">
        <Spinner className="h-6 w-6" />
      </div>
    )
  }
  if (klass.isError || !klass.data) {
    return <p className="py-16 text-center text-muted-foreground">{t('classroom.notFound')}</p>
  }

  const { capabilities, name, teacherName, studentCount } = klass.data

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <Link
        href={backHref}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> {t('classroom.backToClasses')}
      </Link>

      {/* Banner. Deliberately plain — a class needs its name and its teacher
          legible, not a hero image. */}
      <div className="rounded-xl bg-gradient-to-br from-primary-600 to-primary-800 p-6 text-white">
        <h1 className="text-2xl font-bold tracking-tight">{name}</h1>
        <p className="mt-1 text-sm text-primary-100">
          {teacherName}
          {teacherName && ' · '}
          {t('classroom.studentCount', { count: studentCount })}
        </p>
      </div>

      <div className="flex gap-1 border-b border-border" role="tablist">
        {TABS.map(({ id, icon: Icon }) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            onClick={() => setTab(id)}
            className={cn(
              '-mb-px flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors',
              tab === id
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            )}
          >
            <Icon className="h-4 w-4" />
            {t(`classroom.tabs.${id}`)}
          </button>
        ))}
      </div>

      {tab === 'stream' && <ClassStream classId={classId} capabilities={capabilities} />}
      {tab === 'classwork' && (
        <ClassworkTab classId={classId} capabilities={capabilities} />
      )}
      {tab === 'people' && <PeopleTab classId={classId} capabilities={capabilities} />}
    </div>
  )
}
