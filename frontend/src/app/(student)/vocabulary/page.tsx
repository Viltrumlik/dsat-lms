// Domain: Vocabulary
// Description: The shelf — every published word list with how far you have got.
'use client'

import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import { BookA, Layers } from 'lucide-react'
import { vocabularyAPI } from '@/lib/api/vocabulary'
import { useT } from '@/lib/i18n/I18nProvider'
import { Card, CardContent } from '@/components/ui/card'
import { Spinner } from '@/components/ui/spinner'
import { MasteryBar } from '@/components/vocabulary/MasteryBar'

export default function VocabularyPage() {
  const t = useT()
  const sections = useQuery({
    queryKey: ['vocab-sections'],
    queryFn: () => vocabularyAPI.sections(),
  })

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t('vocab.title')}</h1>
        <p className="text-muted-foreground">{t('vocab.subtitle')}</p>
      </div>

      {sections.isLoading && (
        <div className="flex justify-center py-16">
          <Spinner className="h-6 w-6" />
        </div>
      )}

      {sections.isSuccess && sections.data.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 p-12 text-center">
            <BookA className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">{t('vocab.empty')}</p>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {(sections.data ?? []).map((section) => (
          <Link
            key={section.id}
            href={`/vocabulary/sections/${section.id}`}
            className="group rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Card className="h-full transition-colors group-hover:border-primary/50">
              <CardContent className="flex h-full flex-col gap-3 p-5">
                <div className="flex items-start justify-between gap-2">
                  <h2 className="font-semibold leading-tight">{section.title}</h2>
                  <Layers className="h-4 w-4 shrink-0 text-muted-foreground" />
                </div>
                {section.description && (
                  <p className="line-clamp-2 text-sm text-muted-foreground">{section.description}</p>
                )}
                <p className="text-xs text-muted-foreground">
                  {t('vocab.countsLine', { sets: section.setCount, words: section.wordCount })}
                </p>
                <div className="mt-auto">
                  <MasteryBar mastered={section.masteredCount} total={section.wordCount} />
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  )
}
