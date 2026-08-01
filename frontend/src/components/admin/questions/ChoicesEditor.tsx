// Domain: Admin (content studio)
// Description: The A–D answer choices — lettered rows with an auto-growing
//   field, an inline preview, an optional figure, and a one-click "this is the
//   correct answer" toggle so the key can never drift from the choices.
'use client'

import { Check } from 'lucide-react'
import { useT } from '@/lib/i18n/I18nProvider'
import { cn } from '@/lib/utils/cn'
import { Label } from '@/components/ui/label'
import { FieldError } from '@/components/ui/field-error'
import { MathField } from './MathField'
import { ImageUrlField } from './ImageUrlField'
import type { FieldInsert } from './useFieldInsert'
import type { ChoiceLabel } from '@/types'

export const CHOICE_LABELS: ChoiceLabel[] = ['A', 'B', 'C', 'D']

export interface ChoiceDraft {
  text: string
  imageUrl: string
}

export type ChoiceDraftMap = Record<ChoiceLabel, ChoiceDraft>

interface ChoicesEditorProps {
  choices: ChoiceDraftMap
  correctAnswer: string
  onChangeChoice: (label: ChoiceLabel, patch: Partial<ChoiceDraft>) => void
  onPickCorrect: (label: ChoiceLabel) => void
  fieldInsert: FieldInsert
  error?: string
}

export function ChoicesEditor({
  choices,
  correctAnswer,
  onChangeChoice,
  onPickCorrect,
  fieldInsert,
  error,
}: ChoicesEditorProps) {
  const t = useT()

  return (
    <div className="space-y-3">
      <div className="flex items-baseline justify-between gap-2">
        <Label>{t('admin.questions.choices')}</Label>
        <span className="text-xs text-muted-foreground">{t('admin.questions.choicesHint')}</span>
      </div>

      <div className="space-y-3 rounded-lg border border-border bg-muted/30 p-3">
        {CHOICE_LABELS.map((label) => {
          const choice = choices[label]
          const isCorrect = correctAnswer.toUpperCase() === label
          return (
            <div
              key={label}
              className={cn(
                'rounded-lg border bg-background p-3 transition-colors',
                isCorrect ? 'border-success ring-1 ring-success/30' : 'border-border'
              )}
            >
              <div className="flex items-start gap-3">
                <span
                  className={cn(
                    'mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-sm font-semibold',
                    isCorrect ? 'border-success bg-success text-white' : 'border-border'
                  )}
                >
                  {label}
                </span>
                <div className="min-w-0 flex-1 space-y-2">
                  <MathField
                    id={`choice-${label}`}
                    label={t('admin.questions.choiceLabel', { label })}
                    value={choice.text}
                    onChange={(v) => onChangeChoice(label, { text: v })}
                    fieldInsert={fieldInsert}
                    placeholder={t('admin.questions.choicePlaceholder', { label })}
                    rows={1}
                    autoGrow
                    className="[&>label]:sr-only"
                  />
                  <ImageUrlField
                    id={`choice-${label}-image`}
                    label={t('admin.questions.image.choice')}
                    value={choice.imageUrl}
                    onChange={(v) => onChangeChoice(label, { imageUrl: v })}
                    compact
                  />
                </div>
                <button
                  type="button"
                  onClick={() => onPickCorrect(label)}
                  aria-pressed={isCorrect}
                  className={cn(
                    'mt-1 inline-flex shrink-0 items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-semibold transition-colors',
                    isCorrect
                      ? 'border-success bg-success-light text-success-dark'
                      : 'border-border text-muted-foreground hover:border-success hover:text-success-dark'
                  )}
                >
                  <Check className="h-3.5 w-3.5" />
                  {isCorrect ? t('admin.questions.isCorrect') : t('admin.questions.markCorrect')}
                </button>
              </div>
            </div>
          )
        })}
      </div>
      <FieldError message={error} />
    </div>
  )
}
