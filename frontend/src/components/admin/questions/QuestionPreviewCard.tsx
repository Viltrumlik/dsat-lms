// Domain: Admin (content studio)
// Description: Shows the draft exactly as a student meets it in the exam —
//   same Bluebook chrome, same serif type, same choice cards — with the answer
//   key marked. What the author sees here is what the test engine renders.
'use client'

import { useT } from '@/lib/i18n/I18nProvider'
import { cn } from '@/lib/utils/cn'
import { MarkdownMath } from '@/components/test-engine/MarkdownMath'
import { CHOICE_LABELS, type ChoiceDraftMap } from './ChoicesEditor'
import type { AnswerType } from '@/types'

interface QuestionPreviewCardProps {
  answerType: AnswerType
  stem: string
  stemImageUrl: string
  passage: string
  passageImageUrl: string
  choices: ChoiceDraftMap
  correctAnswer: string
  explanation: string
}

export function QuestionPreviewCard({
  answerType,
  stem,
  stemImageUrl,
  passage,
  passageImageUrl,
  choices,
  correctAnswer,
  explanation,
}: QuestionPreviewCardProps) {
  const t = useT()
  const key = correctAnswer.trim().toUpperCase()
  const hasStimulus = Boolean(passage.trim() || passageImageUrl.trim())

  return (
    <div className="overflow-hidden rounded-lg border border-border">
      <div className="flex items-center justify-between gap-2 border-b border-border bg-muted/60 px-3 py-1.5">
        <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
          {t('admin.questions.studentView')}
        </p>
      </div>

      <div className="bg-white p-4">
        {/* The exam's question-header strip. */}
        <div className="mb-4">
          <div className="flex items-center bg-bb-strip">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center bg-bb-ink text-[17px] font-bold text-white">
              1
            </span>
            <span className="ml-3 text-[15px] text-bb-ink">{t('testEngine.markForReview')}</span>
          </div>
          <div className="bb-ticks" aria-hidden />
        </div>

        {hasStimulus && (
          <div className="mb-4 border-l-2 border-bb-rule pl-3">
            {passageImageUrl.trim() && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={passageImageUrl}
                alt=""
                className="mb-2 max-h-48 rounded border border-neutral-300 object-contain"
              />
            )}
            {passage.trim() && <MarkdownMath content={passage} className="bb-prose" />}
          </div>
        )}

        {stemImageUrl.trim() && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={stemImageUrl}
            alt=""
            className="mb-3 max-h-48 rounded border border-neutral-300 object-contain"
          />
        )}

        {stem.trim() ? (
          <MarkdownMath content={stem} className="bb-prose mb-4" />
        ) : (
          <p className="mb-4 font-exam text-[19px] italic text-neutral-400">
            {t('admin.questions.previewEmpty')}
          </p>
        )}

        {answerType === 'mcq' ? (
          <div className="space-y-2.5">
            {CHOICE_LABELS.map((label) => {
              const choice = choices[label]
              if (!choice.text.trim() && !choice.imageUrl.trim()) return null
              const isKey = key === label
              return (
                <div
                  key={label}
                  className={cn(
                    'flex items-start gap-3 rounded-[10px] bg-white px-4 py-3',
                    isKey ? 'border-2 border-success' : 'border border-bb-choice'
                  )}
                >
                  <span
                    className={cn(
                      'mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-[15px] font-semibold',
                      isKey ? 'border-success bg-success text-white' : 'border-bb-choice text-bb-ink'
                    )}
                  >
                    {label}
                  </span>
                  <div className="min-w-0 flex-1">
                    {choice.text.trim() && (
                      <MarkdownMath content={choice.text} className="bb-prose [&_p]:m-0" />
                    )}
                    {choice.imageUrl.trim() && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={choice.imageUrl}
                        alt=""
                        className="mt-2 max-h-24 rounded border border-neutral-300 object-contain"
                      />
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        ) : (
          <div className="space-y-2">
            <div className="h-11 w-52 rounded-[10px] border border-bb-choice bg-white" />
            <p className="font-exam text-[15px] text-bb-ink">
              {t('admin.questions.correctAnswer')}:{' '}
              <span className="font-semibold text-success-dark">{correctAnswer || '—'}</span>
            </p>
          </div>
        )}

        {explanation.trim() && (
          <div className="mt-4 rounded-md border border-neutral-300 bg-neutral-50 p-3">
            <p className="mb-1 text-[10px] font-bold uppercase tracking-widest text-neutral-500">
              {t('admin.questions.explanation')}
            </p>
            <MarkdownMath content={explanation} className="bb-prose text-[15px]" />
          </div>
        )}
      </div>
    </div>
  )
}
