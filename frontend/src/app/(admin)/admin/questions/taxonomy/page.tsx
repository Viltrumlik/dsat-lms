// Domain: Admin (content studio)
// Description: Manage question categories + tags.
'use client'

import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { useT } from '@/lib/i18n/I18nProvider'
import { TaxonomyManager } from '@/components/admin/TaxonomyManager'

export default function TaxonomyPage() {
  const t = useT()
  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <Link
        href="/admin/questions"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> {t('admin.questions.backToList')}
      </Link>
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t('admin.taxonomy.title')}</h1>
        <p className="text-muted-foreground">{t('admin.taxonomy.subtitle')}</p>
      </div>
      <TaxonomyManager />
    </div>
  )
}
