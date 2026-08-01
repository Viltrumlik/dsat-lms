// Domain: Admin (content studio)
// Description: The answer key. MCQ keys are picked from the letters that
//   actually have text, so the key can't point at a blank choice; grid-in keys
//   are typed, with a reminder that equivalent forms all grade as correct.
'use client'

import { useT } from '@/lib/i18n/I18nProvider'
import { cn } from '@/lib/utils/cn'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { FieldError } from '@/components/ui/field-error'
import { CHOICE_LABELS } from './ChoicesEditor'
import type { AnswerType, ChoiceLabel } from '@/types'

interface CorrectAnswerFieldProps {
  answerType: AnswerType
  value: string
  onChange: (next: string) => void
  /** Letters with choice text — only these can be the key. */
  availableLabels: ChoiceLabel[]
  error?: string
}

export function CorrectAnswerField({
  answerType,
  value,
  onChange,
  availableLabels,
  error,
}: CorrectAnswerFieldProps) {
  const t = useT()

  if (answerType === 'grid_in') {
    return (
      <div className="space-y-2">
        <Label htmlFor="q-correct">{t('admin.questions.correctAnswer')}</Label>
        <Input
          id="q-correct"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={t('admin.questions.gridInPlaceholder')}
          className="max-w-xs font-mono"
        />
        <p className="text-xs text-muted-foreground">{t('admin.questions.gridInHint')}</p>
        <FieldError message={error} />
      </div>
    )
  }

  const key = value.trim().toUpperCase()

  return (
    <div className="space-y-2">
      <Label>{t('admin.questions.correctAnswer')}</Label>
      <div className="flex gap-2" role="group" aria-label={t('admin.questions.correctAnswer')}>
        {CHOICE_LABELS.map((label) => {
          const selectable = availableLabels.includes(label)
          const selected = key === label
          return (
            <button
              key={label}
              type="button"
              disabled={!selectable}
              aria-pressed={selected}
              onClick={() => onChange(label)}
              title={selectable ? undefined : t('admin.questions.keyNeedsChoice', { label })}
              className={cn(
                'flex h-11 w-11 items-center justify-center rounded-lg border text-base font-bold transition-colors',
                selected
                  ? 'border-success bg-success text-white'
                  : 'border-border hover:border-success hover:bg-success-light/50',
                !selectable && 'cursor-not-allowed opacity-40 hover:border-border hover:bg-transparent'
              )}
            >
              {label}
            </button>
          )
        })}
      </div>
      <p className="text-xs text-muted-foreground">
        {availableLabels.length === 0
          ? t('admin.questions.keyNoChoices')
          : t('admin.questions.keyHint')}
      </p>
      <FieldError message={error} />
    </div>
  )
}
