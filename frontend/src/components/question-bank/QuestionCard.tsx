// Domain: Question Bank
// Description: Single question preview card linking to the study view.
'use client'

import Link from 'next/link'
import { ArrowUpRight } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { useT } from '@/lib/i18n/I18nProvider'
import { MarkdownMath } from '@/components/test-engine/MarkdownMath'
import { DifficultyDots } from './DifficultyDots'
import { MODULE_LABEL_KEY, ANSWER_TYPE_LABEL_KEY, moduleBadgeVariant } from './labels'
import type { QuestionListItem } from '@/types'

export function QuestionCard({ q }: { q: QuestionListItem }) {
  const t = useT()
  return (
    <Link
      href={`/questions/${q.id}`}
      className="group block rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
    >
      <Card className="h-full transition-colors group-hover:border-primary/50">
        <CardContent className="flex h-full flex-col gap-3 p-5">
          <div className="flex items-center justify-between gap-2">
            <Badge variant={moduleBadgeVariant(q.module)}>{t(MODULE_LABEL_KEY[q.module])}</Badge>
            <DifficultyDots level={q.difficulty} />
          </div>

          <MarkdownMath
            content={q.stem}
            className="line-clamp-3 text-sm leading-relaxed [&_p]:m-0"
          />

          <div className="mt-auto flex items-center justify-between gap-2 pt-1 text-xs text-muted-foreground">
            <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="font-medium text-foreground/80">{q.category?.name}</span>
              <span aria-hidden>·</span>
              <span>{t(ANSWER_TYPE_LABEL_KEY[q.answerType])}</span>
            </span>
            <ArrowUpRight className="h-4 w-4 shrink-0 opacity-0 transition-opacity group-hover:opacity-100" />
          </div>
        </CardContent>
      </Card>
    </Link>
  )
}
