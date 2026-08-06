// Domain: Vocabulary
// Description: The flashcard run — see the word, recall it, flip, say whether
//   you knew it. Whatever you missed comes back in another round until the pile
//   is empty; that repetition is the whole teaching mechanism.
//
// Verdicts are reported ONE AT A TIME as they are given, not batched to the end:
// a student who closes the tab after twenty of twenty-five cards keeps those
// twenty. Finishing is a separate call, so quitting halfway records the progress
// without claiming the deck was cleared.
'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, RotateCcw, X } from 'lucide-react'
import { vocabularyAPI } from '@/lib/api/vocabulary'
import { useT } from '@/lib/i18n/I18nProvider'
import { cn } from '@/lib/utils/cn'
import { Button } from '@/components/ui/button'
import { FullPageSpinner } from '@/components/ui/spinner'
import type { VocabWord } from '@/types'

type Phase = 'study' | 'round-over' | 'done'

export function FlashcardRunner({ setId }: { setId: string }) {
  const t = useT()
  const router = useRouter()
  const queryClient = useQueryClient()

  const detail = useQuery({
    queryKey: ['vocab-set', setId],
    queryFn: () => vocabularyAPI.set(setId),
  })

  const [sessionId, setSessionId] = React.useState<string | null>(null)
  const [deck, setDeck] = React.useState<VocabWord[]>([])
  const [index, setIndex] = React.useState(0)
  const [flipped, setFlipped] = React.useState(false)
  const [missed, setMissed] = React.useState<VocabWord[]>([])
  const [round, setRound] = React.useState(1)
  const [knewCount, setKnewCount] = React.useState(0)
  const [phase, setPhase] = React.useState<Phase>('study')

  // Start once, when the words arrive.
  const started = React.useRef(false)
  React.useEffect(() => {
    if (!detail.data || started.current) return
    started.current = true
    setDeck(detail.data.words)
    vocabularyAPI.start(setId).then(
      (session) => setSessionId(session.id),
      () => undefined // the run still works; only the record of it is lost
    )
  }, [detail.data, setId])

  const report = React.useCallback(
    (wordId: string, correct: boolean) => {
      if (!sessionId) return
      vocabularyAPI.report(sessionId, [{ word: wordId, correct }]).catch(() => undefined)
    },
    [sessionId]
  )

  const finish = useMutation({
    mutationFn: () => (sessionId ? vocabularyAPI.finish(sessionId) : Promise.resolve(null)),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['vocab-set', setId] })
      queryClient.invalidateQueries({ queryKey: ['vocab-sections'] })
      queryClient.invalidateQueries({ queryKey: ['vocab-section'] })
    },
  })

  const current = deck[index]

  const answer = React.useCallback(
    (knew: boolean) => {
      if (!current) return
      report(current.id, knew)
      const nextMissed = knew ? missed : [...missed, current]
      setMissed(nextMissed)
      if (knew) setKnewCount((n) => n + 1)

      if (index + 1 < deck.length) {
        setIndex(index + 1)
        setFlipped(false)
        return
      }
      if (nextMissed.length === 0) {
        setPhase('done')
        finish.mutate()
      } else {
        setPhase('round-over')
      }
    },
    [current, deck.length, index, missed, report, finish]
  )

  const nextRound = () => {
    setDeck(missed)
    setMissed([])
    setIndex(0)
    setFlipped(false)
    setRound((r) => r + 1)
    setPhase('study')
  }

  // Space flips, 1/← is "didn't know", 2/→ is "knew it".
  React.useEffect(() => {
    if (phase !== 'study') return
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return
      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault()
        setFlipped((f) => !f)
      } else if (e.key === '1' || e.key === 'ArrowLeft') {
        e.preventDefault()
        answer(false)
      } else if (e.key === '2' || e.key === 'ArrowRight') {
        e.preventDefault()
        answer(true)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [phase, answer])

  if (detail.isLoading) return <FullPageSpinner label={t('vocab.loading')} />
  if (detail.isError || !detail.data) {
    return <p className="py-16 text-center text-muted-foreground">{t('vocab.loadFailed')}</p>
  }

  const set = detail.data

  if (set.words.length === 0) {
    return (
      <div className="mx-auto max-w-lg py-16 text-center">
        <p className="text-muted-foreground">{t('vocab.emptySet')}</p>
        <Button className="mt-4" variant="outline" onClick={() => router.back()}>
          {t('common.back')}
        </Button>
      </div>
    )
  }

  if (phase === 'done') {
    return (
      <div className="mx-auto max-w-lg space-y-5 py-16 text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-success-light">
          <Check className="h-8 w-8 text-success" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">{t('vocab.runner.doneTitle')}</h1>
          <p className="mt-1 text-muted-foreground">
            {t('vocab.runner.doneBody', { count: set.words.length, rounds: round })}
          </p>
        </div>
        <div className="flex justify-center gap-3">
          <Button variant="outline" onClick={() => router.push(`/vocabulary/sets/${setId}`)}>
            {t('vocab.runner.backToSet')}
          </Button>
          <Button onClick={() => window.location.reload()}>{t('vocab.runner.again')}</Button>
        </div>
      </div>
    )
  }

  if (phase === 'round-over') {
    return (
      <div className="mx-auto max-w-lg space-y-5 py-16 text-center">
        <h1 className="text-2xl font-bold">{t('vocab.runner.roundTitle', { round })}</h1>
        <p className="text-muted-foreground">
          {t('vocab.runner.roundBody', { missed: missed.length })}
        </p>
        <div className="flex justify-center gap-3">
          <Button variant="outline" onClick={() => router.push(`/vocabulary/sets/${setId}`)}>
            {t('vocab.runner.stop')}
          </Button>
          <Button onClick={nextRound}>
            <RotateCcw className="h-4 w-4" /> {t('vocab.runner.practiseMissed')}
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4">
      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>{set.sectionTitle} · {set.title}</span>
        <span className="tabular-nums">
          {t('vocab.runner.progress', { current: index + 1, total: deck.length })}
          {round > 1 && ` · ${t('vocab.runner.roundN', { round })}`}
        </span>
      </div>

      <div className="h-1.5 overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-primary transition-all"
          style={{ width: `${((index) / deck.length) * 100}%` }}
        />
      </div>

      {/* The card. Clicking anywhere flips it — the whole surface is the control. */}
      <button
        type="button"
        onClick={() => setFlipped((f) => !f)}
        aria-label={t('vocab.runner.flip')}
        className={cn(
          'flex min-h-[16rem] w-full flex-col items-center justify-center gap-3 rounded-2xl border-2 p-8 text-center transition-colors',
          flipped ? 'border-primary bg-primary-50 dark:bg-primary-800/20' : 'border-border bg-card hover:border-primary-300'
        )}
      >
        {flipped ? (
          <>
            <p className="text-xl font-medium leading-relaxed">{current?.definition}</p>
            {current?.example && (
              <p className="text-sm italic text-muted-foreground">{current.example}</p>
            )}
          </>
        ) : (
          <>
            <p className="text-4xl font-bold">{current?.word}</p>
            {current?.partOfSpeech && current.partOfSpeech !== 'other' && (
              <p className="text-sm italic text-muted-foreground">
                {t(`vocab.part.${current.partOfSpeech}`)}
              </p>
            )}
            <p className="text-xs text-muted-foreground">{t('vocab.runner.tapToFlip')}</p>
          </>
        )}
      </button>

      <div className="flex gap-3">
        <Button variant="outline" className="flex-1" onClick={() => answer(false)}>
          <X className="h-4 w-4 text-error" /> {t('vocab.runner.didntKnow')}
        </Button>
        <Button variant="outline" className="flex-1" onClick={() => answer(true)}>
          <Check className="h-4 w-4 text-success" /> {t('vocab.runner.knewIt')}
        </Button>
      </div>

      <p className="text-center text-xs text-muted-foreground">
        {t('vocab.runner.shortcuts')} · {t('vocab.runner.knownSoFar', { count: knewCount })}
      </p>
    </div>
  )
}
