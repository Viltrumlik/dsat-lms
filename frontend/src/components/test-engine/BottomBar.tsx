// Domain: Test Engine
// Description: Bluebook footer — student name, the "Question X of Y" pill that
//   opens the jump grid, and the Back / Next buttons. The store handles
//   section + review transitions when advancing past the last question.
'use client'

import * as React from 'react'
import { ChevronUp } from 'lucide-react'
import { useSessionStore } from '@/lib/stores/sessionStore'
import { useAuth } from '@/lib/auth/AuthProvider'
import { useT } from '@/lib/i18n/I18nProvider'
import { QuestionNavigator } from './QuestionNavigator'

export function BottomBar() {
  const t = useT()
  const { user } = useAuth()
  const sections = useSessionStore((s) => s.sections)
  const sectionIndex = useSessionStore((s) => s.currentSectionIndex)
  const questionIndex = useSessionStore((s) => s.currentQuestionIndex)
  const nextQuestion = useSessionStore((s) => s.nextQuestion)
  const prevQuestion = useSessionStore((s) => s.prevQuestion)
  const goToReview = useSessionStore((s) => s.goToReview)

  const [navOpen, setNavOpen] = React.useState(false)
  const popoverRef = React.useRef<HTMLDivElement>(null)

  const section = sections[sectionIndex]
  // The module's real size, not the array's — the paper is served a module
  // at a time and the array is empty until this one is handed over.
  const total = section?.questionCount ?? 0
  const isLastSection = sectionIndex === sections.length - 1
  const isLastInSection = total > 0 && questionIndex === total - 1

  const nextLabel = !isLastInSection
    ? t('testEngine.next')
    : isLastSection
      ? t('testEngine.review')
      : t('testEngine.finishSection')

  // Click-away + Escape close the popover.
  React.useEffect(() => {
    if (!navOpen) return
    const onDown = (e: MouseEvent) => {
      if (!popoverRef.current?.contains(e.target as Node)) setNavOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setNavOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    window.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      window.removeEventListener('keydown', onKey)
    }
  }, [navOpen])

  return (
    <footer className="relative shrink-0 bg-bb-chrome">
      <div className="bb-ticks" aria-hidden />
      <div className="flex h-[68px] items-center justify-between gap-3 px-6">
        <p className="min-w-0 flex-1 truncate text-[19px] font-bold text-bb-ink">
          {user?.fullName ?? ''}
        </p>

        {/* Centre pill + popover */}
        <div ref={popoverRef} className="relative shrink-0">
          {navOpen && (
            <div className="absolute bottom-[calc(100%+14px)] left-1/2 z-40 -translate-x-1/2">
              <QuestionNavigator
                onJump={() => setNavOpen(false)}
                onClose={() => setNavOpen(false)}
                onGoToReview={() => {
                  setNavOpen(false)
                  goToReview()
                }}
              />
              <div
                className="absolute left-1/2 h-0 w-0 -translate-x-1/2 border-x-[14px] border-t-[14px] border-x-transparent border-t-white"
                aria-hidden
              />
            </div>
          )}
          <button
            type="button"
            onClick={() => setNavOpen((v) => !v)}
            aria-expanded={navOpen}
            aria-haspopup="dialog"
            className="flex items-center gap-2 rounded-lg bg-bb-ink px-5 py-2.5 text-[17px] font-bold text-white transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bb-blue focus-visible:ring-offset-2"
          >
            {t('testEngine.questionProgress', { current: questionIndex + 1, total })}
            <ChevronUp
              className={cnChevron(navOpen)}
              aria-hidden
            />
          </button>
        </div>

        <div className="flex flex-1 items-center justify-end gap-3">
          <button
            type="button"
            onClick={prevQuestion}
            disabled={questionIndex === 0}
            aria-label={t('testEngine.prevAria')}
            className="rounded-full bg-bb-blue px-7 py-2.5 text-[17px] font-bold text-white transition-colors hover:bg-bb-blueDark focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bb-blue focus-visible:ring-offset-2 disabled:opacity-40"
          >
            {t('testEngine.back')}
          </button>
          <button
            type="button"
            onClick={nextQuestion}
            aria-label={t('testEngine.nextAria')}
            className="rounded-full bg-bb-blue px-7 py-2.5 text-[17px] font-bold text-white transition-colors hover:bg-bb-blueDark focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bb-blue focus-visible:ring-offset-2"
          >
            {nextLabel}
          </button>
        </div>
      </div>
    </footer>
  )
}

function cnChevron(open: boolean) {
  return `h-5 w-5 transition-transform ${open ? 'rotate-180' : ''}`
}
