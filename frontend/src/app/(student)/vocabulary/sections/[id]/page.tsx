// Domain: Vocabulary
// Description: One word list and the decks inside it.
'use client'

import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, CheckCircle2 } from 'lucide-react'
import { vocabularyAPI } from '@/lib/api/vocabulary'
import { useT } from '@/lib/i18n/I18nProvider'
import { Card, CardContent } from '@/components/ui/card'
import { Spinner } from '@/components/ui/spinner'
import { MasteryBar } from '@/components/vocabulary/MasteryBar'

export default function VocabSectionPage({ params }: { params: { id: string } }) {
  const t = useT()
  const section = useQuery({
    queryKey: ['vocab-section', params.id],
    queryFn: () => vocabularyAPI.section(params.id),
  })

  if (section.isLoading) {
    return (
      <div className="flex justify-center py-16">
        <Spinner className="h-6 w-6" />
      </div>
    )
  }
  if (section.isError || !section.data) {
    return <p className="py-16 text-center text-muted-foreground">{t('vocab.loadFailed')}</p>
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <Link
        href="/vocabulary"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> {t('vocab.backToLists')}
      </Link>

      <div>
        <h1 className="text-2xl font-bold tracking-tight">{section.data.title}</h1>
        {section.data.description && (
          <p className="text-muted-foreground">{section.data.description}</p>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {section.data.sets.map((deck) => (
          <Link
            key={deck.id}
            href={`/vocabulary/sets/${deck.id}`}
            className="group rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Card className="h-full transition-colors group-hover:border-primary/50">
              <CardContent className="flex h-full flex-col gap-3 p-5">
                <div className="flex items-center justify-between gap-2">
                  <h2 className="font-semibold">{deck.title}</h2>
                  {deck.isCompleted && <CheckCircle2 className="h-4 w-4 shrink-0 text-success" />}
                </div>
                <p className="text-xs text-muted-foreground">
                  {t('vocab.wordCount', { count: deck.wordCount })}
                </p>
                <div className="mt-auto">
                  <MasteryBar mastered={deck.masteredCount} total={deck.wordCount} />
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  )
}
