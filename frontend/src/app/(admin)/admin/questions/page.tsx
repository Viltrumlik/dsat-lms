// Domain: Admin (content studio)
// Description: Question directory — list/filter/search + create; the status=review
//   filter doubles as the review queue.
'use client'

import Link from 'next/link'
import { useT } from '@/lib/i18n/I18nProvider'
import { QuestionsView } from '@/components/admin/QuestionsView'

export default function AdminQuestionsPage() {
  const t = useT()
  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t('admin.questions.title')}</h1>
          <p className="text-muted-foreground">{t('admin.questions.subtitle')}</p>
        </div>
        <Link
          href="/admin/questions/taxonomy"
          className="shrink-0 text-sm text-primary hover:underline"
        >
          {t('admin.taxonomy.manageLink')}
        </Link>
      </div>
      <QuestionsView />
    </div>
  )
}
