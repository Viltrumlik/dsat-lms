// Domain: Test Engine
// Description: Bottom navigation — prev/next + a question-grid popover. The store
//   handles section/review transitions when advancing past the last question.
'use client'

import * as React from 'react'
import { ChevronLeft, ChevronRight, LayoutGrid } from 'lucide-react'
import { useSessionStore } from '@/lib/stores/sessionStore'
import { useT } from '@/lib/i18n/I18nProvider'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { QuestionNavigator } from './QuestionNavigator'

export function BottomBar() {
  const t = useT()
  const sections = useSessionStore((s) => s.sections)
  const sectionIndex = useSessionStore((s) => s.currentSectionIndex)
  const questionIndex = useSessionStore((s) => s.currentQuestionIndex)
  const nextQuestion = useSessionStore((s) => s.nextQuestion)
  const prevQuestion = useSessionStore((s) => s.prevQuestion)

  const [navOpen, setNavOpen] = React.useState(false)

  const section = sections[sectionIndex]
  const isLastSection = sectionIndex === sections.length - 1
  const isLastInSection = section ? questionIndex === section.questions.length - 1 : false

  const nextLabel = !isLastInSection
    ? t('testEngine.next')
    : isLastSection
      ? t('testEngine.review')
      : t('testEngine.finishSection')

  return (
    <footer className="flex h-16 shrink-0 items-center justify-between gap-3 border-t border-border bg-card px-4 md:px-6">
      <Button
        variant="outline"
        onClick={prevQuestion}
        disabled={questionIndex === 0}
        aria-label={t('testEngine.prevAria')}
      >
        <ChevronLeft className="h-4 w-4" /> {t('testEngine.back')}
      </Button>

      <Dialog open={navOpen} onOpenChange={setNavOpen}>
        <DialogTrigger asChild>
          <Button variant="ghost" className="gap-2">
            <LayoutGrid className="h-4 w-4" />
            <span className="tabular-nums">
              {questionIndex + 1} / {section?.questions.length ?? 0}
            </span>
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('testEngine.jumpToQuestion')}</DialogTitle>
          </DialogHeader>
          <QuestionNavigator onJump={() => setNavOpen(false)} />
        </DialogContent>
      </Dialog>

      <Button onClick={nextQuestion} aria-label={t('testEngine.nextAria')}>
        {nextLabel} <ChevronRight className="h-4 w-4" />
      </Button>
    </footer>
  )
}
