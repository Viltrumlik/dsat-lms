// Domain: Test Engine
// Description: Renders the current question — passage + stem + answer area, with
//   flag / cross-out / note annotations wired to the session store.
'use client'

import * as React from 'react'
import { Flag, StickyNote } from 'lucide-react'
import { useSessionStore, selectCurrentQuestion } from '@/lib/stores/sessionStore'
import { useAnswerSync } from '@/lib/hooks/useAnswerSync'
import { useT } from '@/lib/i18n/I18nProvider'
import { cn } from '@/lib/utils/cn'
import { MarkdownMath } from './MarkdownMath'
import { ChoiceList } from './ChoiceList'
import { GridIn } from './GridIn'
import type { ChoiceLabel, QuestionClientState } from '@/types'

export function QuestionPane() {
  const t = useT()
  const question = useSessionStore(selectCurrentQuestion)
  const sectionIndex = useSessionStore((s) => s.currentSectionIndex)
  const questionIndex = useSessionStore((s) => s.currentQuestionIndex)
  const section = useSessionStore((s) => s.sections[s.currentSectionIndex])
  const rawQState = useSessionStore((s) =>
    question ? s.questionStates[question.id] : undefined
  )
  const qState = React.useMemo<QuestionClientState>(
    () => ({
      answer: rawQState?.answer ?? null,
      flagged: rawQState?.flagged ?? false,
      note: rawQState?.note ?? '',
      crossedOut: rawQState?.crossedOut ?? [],
      highlight: rawQState?.highlight ?? null,
    }),
    [rawQState]
  )

  const setAnswer = useSessionStore((s) => s.setAnswer)
  const toggleFlag = useSessionStore((s) => s.toggleFlag)
  const toggleCrossOut = useSessionStore((s) => s.toggleCrossOut)
  const setNote = useSessionStore((s) => s.setNote)
  const syncAnswer = useAnswerSync()

  const [showNote, setShowNote] = React.useState(false)

  if (!question || !qState || !section) {
    return <div className="p-8 text-muted-foreground">{t('testEngine.noQuestion')}</div>
  }

  const handleSelect = (label: string) => {
    setAnswer(question.id, label)
    syncAnswer(question.id, label)
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {/* Passage (Reading & Writing) */}
      {(question.passage || question.passageImageUrl) && (
        <div className="lg:border-r lg:border-border lg:pr-6">
          {question.passageImageUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={question.passageImageUrl}
              alt=""
              className="mb-4 max-w-full rounded-md border border-border"
            />
          )}
          {question.passage && <MarkdownMath content={question.passage} className="leading-relaxed" />}
        </div>
      )}

      {/* Question + answer */}
      <div className={cn('space-y-5', !(question.passage || question.passageImageUrl) && 'lg:col-span-2 mx-auto w-full max-w-3xl')}>
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold text-muted-foreground">
            {t('testEngine.questionProgress', {
              current: questionIndex + 1,
              total: section.questions.length,
            })}
          </span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => toggleFlag(question.id)}
              aria-pressed={qState.flagged}
              className={cn(
                'flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm font-medium transition-colors',
                qState.flagged
                  ? 'bg-warning-light text-warning-dark'
                  : 'text-muted-foreground hover:bg-muted'
              )}
            >
              <Flag className={cn('h-4 w-4', qState.flagged && 'fill-current')} />
              {qState.flagged ? t('testEngine.flagged') : t('testEngine.flag')}
            </button>
            <button
              type="button"
              onClick={() => setShowNote((v) => !v)}
              aria-pressed={showNote}
              className={cn(
                'flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm font-medium transition-colors',
                showNote || qState.note
                  ? 'bg-primary-50 text-primary-700 dark:bg-primary-800/40 dark:text-primary-100'
                  : 'text-muted-foreground hover:bg-muted'
              )}
            >
              <StickyNote className="h-4 w-4" />
              {t('testEngine.note')}
            </button>
          </div>
        </div>

        {question.stemImageUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={question.stemImageUrl}
            alt=""
            className="max-w-full rounded-md border border-border"
          />
        )}

        <MarkdownMath content={question.stem} className="text-lg leading-relaxed" />

        {showNote && (
          <textarea
            value={qState.note}
            onChange={(e) => setNote(question.id, e.target.value)}
            placeholder={t('testEngine.notePlaceholder')}
            rows={2}
            className="w-full rounded-md border border-input bg-background p-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        )}

        <div key={`${sectionIndex}-${questionIndex}`}>
          {question.answerType === 'mcq' ? (
            <ChoiceList
              choices={question.choices}
              value={qState.answer}
              crossedOut={qState.crossedOut}
              onSelect={handleSelect}
              onToggleCrossOut={(label: ChoiceLabel) => toggleCrossOut(question.id, label)}
            />
          ) : (
            <GridIn
              value={qState.answer}
              onChange={(v) => {
                setAnswer(question.id, v)
                syncAnswer(question.id, v)
              }}
            />
          )}
        </div>
      </div>
    </div>
  )
}
