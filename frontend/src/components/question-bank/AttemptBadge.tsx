// Domain: Question Bank
// Description: "You've done this one" — the mark a question carries once the
//   student has answered it, and how it went.
//
// `isCorrect` is null while the sitting the answer came from is still ungraded
// (a paper is only marked at submit), so three states, not two: right, wrong,
// and answered-but-not-yet-known.
'use client'

import { CheckCircle2, CircleDot, XCircle } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { useT } from '@/lib/i18n/I18nProvider'
import type { MyAttempt } from '@/types'

export function AttemptBadge({ attempt }: { attempt: MyAttempt }) {
  const t = useT()

  if (attempt.isCorrect === true) {
    return (
      <Badge variant="success" className="gap-1">
        <CheckCircle2 className="h-3 w-3" /> {t('questionBank.attempt.correct')}
      </Badge>
    )
  }
  if (attempt.isCorrect === false) {
    return (
      <Badge variant="error" className="gap-1">
        <XCircle className="h-3 w-3" /> {t('questionBank.attempt.incorrect')}
      </Badge>
    )
  }
  return (
    <Badge variant="secondary" className="gap-1">
      <CircleDot className="h-3 w-3" /> {t('questionBank.attempt.answered')}
    </Badge>
  )
}
