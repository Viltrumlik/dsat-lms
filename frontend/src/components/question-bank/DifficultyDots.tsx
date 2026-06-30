// Domain: Question Bank
// Description: Compact 1–5 difficulty indicator (filled dots).
'use client'

import { cn } from '@/lib/utils/cn'
import { useT } from '@/lib/i18n/I18nProvider'
import { DIFFICULTY_LABEL_KEY } from './labels'

export function DifficultyDots({ level }: { level: number }) {
  const t = useT()
  const label = DIFFICULTY_LABEL_KEY[level]
    ? t(DIFFICULTY_LABEL_KEY[level])
    : t('questionBank.difficultyLevel', { level })
  return (
    <span
      className="inline-flex items-center gap-0.5"
      role="img"
      aria-label={t('questionBank.difficultyAria', { label })}
      title={label}
    >
      {Array.from({ length: 5 }).map((_, i) => (
        <span
          key={i}
          className={cn('h-1.5 w-1.5 rounded-full', i < level ? 'bg-primary' : 'bg-muted')}
        />
      ))}
    </span>
  )
}
