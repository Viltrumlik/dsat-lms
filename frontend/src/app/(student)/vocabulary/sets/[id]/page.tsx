// Domain: Vocabulary
// Description: One deck — every card in it, where you stand on each, and the
//   one way to study it.
'use client'

import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, Layers, Play } from 'lucide-react'
import { vocabularyAPI } from '@/lib/api/vocabulary'
import { useT } from '@/lib/i18n/I18nProvider'
import { cn } from '@/lib/utils/cn'
import { Badge } from '@/components/ui/badge'
import { Button, buttonVariants } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Spinner } from '@/components/ui/spinner'
import { MasteryBar } from '@/components/vocabulary/MasteryBar'
import type { VocabStatus } from '@/types'

const STATUS_VARIANT: Record<VocabStatus, 'secondary' | 'warning' | 'success'> = {
  new: 'secondary',
  learning: 'warning',
  mastered: 'success',
}

export default function VocabSetPage({ params }: { params: { id: string } }) {
  const t = useT()
  const set = useQuery({
    queryKey: ['vocab-set', params.id],
    queryFn: () => vocabularyAPI.set(params.id),
  })

  if (set.isLoading) {
    return (
      <div className="flex justify-center py-16">
        <Spinner className="h-6 w-6" />
      </div>
    )
  }
  if (set.isError || !set.data) {
    return <p className="py-16 text-center text-muted-foreground">{t('vocab.loadFailed')}</p>
  }

  const deck = set.data

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Link
        href="/vocabulary"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> {t('vocab.backToLists')}
      </Link>

      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <Layers className="h-4 w-4" /> {deck.sectionTitle}
          </p>
          <h1 className="text-2xl font-bold tracking-tight">{deck.title}</h1>
          <p className="text-muted-foreground">{t('vocab.wordCount', { count: deck.wordCount })}</p>
        </div>
        <Link
          href={`/vocabulary/sets/${deck.id}/flashcards`}
          className={cn(buttonVariants({ size: 'lg' }))}
        >
          <Play className="h-4 w-4" /> {t('vocab.studyFlashcards')}
        </Link>
      </div>

      <Card>
        <CardContent className="p-5">
          <MasteryBar mastered={deck.masteredCount} total={deck.wordCount} />
        </CardContent>
      </Card>

      <Card>
        <CardContent className="divide-y divide-border p-0">
          {deck.words.map((word) => (
            <div key={word.id} className="flex items-start gap-3 p-4">
              <div className="min-w-0 flex-1">
                <p className="font-semibold">{word.word}</p>
                <p className="text-sm text-muted-foreground">{word.definition}</p>
                {word.example && (
                  <p className="mt-1 text-xs italic text-muted-foreground">{word.example}</p>
                )}
              </div>
              <Badge variant={STATUS_VARIANT[word.myStatus]}>
                {t(`vocab.status.${word.myStatus}`)}
              </Badge>
            </div>
          ))}
          {deck.words.length === 0 && (
            <p className="p-10 text-center text-sm text-muted-foreground">{t('vocab.emptySet')}</p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
