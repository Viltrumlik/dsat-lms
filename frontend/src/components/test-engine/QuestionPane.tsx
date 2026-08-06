// Domain: Test Engine
// Description: The two exam panes — the stimulus (passage + figure) on the
//   left, the question (header strip, stem, answers) on the right. Both are
//   annotatable; questions with no stimulus render single-column, as in the app.
'use client'

import {
  useSessionStore,
  selectCurrentQuestion,
  selectCurrentAnnotations,
} from '@/lib/stores/sessionStore'
import { useAnswerSync } from '@/lib/hooks/useAnswerSync'
import { useT } from '@/lib/i18n/I18nProvider'
import { MarkdownMath } from './MarkdownMath'
import { ChoiceList } from './ChoiceList'
import { GridIn } from './GridIn'
import { QuestionHeader } from './QuestionHeader'
import { SplitPane } from './SplitPane'
import { AnnotatableText } from './AnnotatableText'
import { NotesRail } from './NotesRail'
import { ZoomableFigure } from './ZoomableFigure'
import type { ChoiceLabel } from '@/types'

export function QuestionPane() {
  const t = useT()
  const question = useSessionStore(selectCurrentQuestion)
  const questionIndex = useSessionStore((s) => s.currentQuestionIndex)
  const annotations = useSessionStore(selectCurrentAnnotations)
  const notesOpen = useSessionStore((s) => s.notesOpen)

  const rawQState = useSessionStore((s) => (question ? s.questionStates[question.id] : undefined))

  const setAnswer = useSessionStore((s) => s.setAnswer)
  const toggleFlag = useSessionStore((s) => s.toggleFlag)
  const toggleCrossOut = useSessionStore((s) => s.toggleCrossOut)
  const syncAnswer = useAnswerSync()
  const verdict = useSessionStore((s) => (question ? (s.verdicts[question.id] ?? null) : null))

  if (!question) {
    return <div className="p-8 text-neutral-600">{t('testEngine.noQuestion')}</div>
  }

  const answer = rawQState?.answer ?? null
  const flagged = rawQState?.flagged ?? false
  const crossedOut = rawQState?.crossedOut ?? []

  const handleSelect = (label: string) => {
    setAnswer(question.id, label)
    syncAnswer(question.id, label)
  }

  const hasStimulus = Boolean(question.passage || question.passageImageUrl)

  const questionSide = (
    <div className="px-6 py-5">
      <div className="mx-auto max-w-[46rem]">
        <QuestionHeader
          number={questionIndex + 1}
          flagged={flagged}
          onToggleFlag={() => toggleFlag(question.id)}
          showEliminator={question.answerType === 'mcq'}
        />

        {question.stemImageUrl && <ZoomableFigure src={question.stemImageUrl} />}

        <AnnotatableText
          questionId={question.id}
          target="stem"
          annotations={annotations}
          contentKey={`stem-${question.id}`}
          className="mb-6"
        >
          <MarkdownMath content={question.stem} className="bb-prose" />
        </AnnotatableText>

        {question.answerType === 'mcq' ? (
          <ChoiceList
            choices={question.choices}
            value={answer}
            crossedOut={crossedOut}
            onSelect={handleSelect}
            onToggleCrossOut={(label: ChoiceLabel) => toggleCrossOut(question.id, label)}
            verdict={verdict}
          />
        ) : (
          <GridIn
            value={answer}
            // Typing only touches the store. Sending every keystroke meant a
            // drill marked "15.2" four times on the way in, judging "1" wrong
            // before the student had finished the number.
            onChange={(v) => setAnswer(question.id, v)}
            onCommit={() => {
              const current = (answer ?? '').trim()
              if (current) syncAnswer(question.id, current)
            }}
            verdict={verdict}
          />
        )}
      </div>
    </div>
  )

  if (!hasStimulus) {
    return (
      <div className="flex h-full min-h-0">
        {notesOpen && <NotesRail questionId={question.id} annotations={annotations} />}
        <div className="min-w-0 flex-1 overflow-y-auto">{questionSide}</div>
      </div>
    )
  }

  const stimulusSide = (
    <div className="flex h-full min-h-0">
      <div className="min-w-0 flex-1 overflow-y-auto px-6 py-5">
        {question.passageImageUrl && <ZoomableFigure src={question.passageImageUrl} />}
        {question.passage && (
          <AnnotatableText
            questionId={question.id}
            target="stimulus"
            annotations={annotations}
            contentKey={`stimulus-${question.id}`}
          >
            <MarkdownMath content={question.passage} className="bb-prose" />
          </AnnotatableText>
        )}
      </div>
      {notesOpen && <NotesRail questionId={question.id} annotations={annotations} />}
    </div>
  )

  return <SplitPane left={stimulusSide} right={questionSide} />
}
