// Domain: Academy (classroom)
// Description: One class's stream. Access is membership-scoped server-side —
//   a class the student is not in 404s, so there is no client-side guard here.
'use client'

import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft } from 'lucide-react'
import { classesAPI } from '@/lib/api/classes'
import { useT } from '@/lib/i18n/I18nProvider'
import { ClassStream } from '@/components/classroom/ClassStream'

export default function ClassStreamPage({ params }: { params: { id: string } }) {
  const t = useT()
  const { data } = useQuery({ queryKey: ['my-classes'], queryFn: classesAPI.mine })
  const klass = data?.find((c) => c.id === params.id)

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Link
        href="/classes"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> {t('classroom.backToClasses')}
      </Link>

      <div>
        <h1 className="text-2xl font-bold tracking-tight">{klass?.name ?? t('classroom.title')}</h1>
        {klass?.teacherName && <p className="text-muted-foreground">{klass.teacherName}</p>}
      </div>

      <ClassStream classId={params.id} />
    </div>
  )
}
