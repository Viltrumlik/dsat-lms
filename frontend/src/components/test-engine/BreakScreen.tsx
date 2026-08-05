// Domain: Test Engine
// Description: Between-section interstitial. Advances to the next section.
'use client'

import * as React from 'react'
import { ArrowRight, CheckCircle2 } from 'lucide-react'
import { useSessionStore } from '@/lib/stores/sessionStore'
import { sessionAPI } from '@/lib/api/sessions'
import { useT } from '@/lib/i18n/I18nProvider'
import { parseApiError } from '@/lib/api/errors'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/toast'
import { sectionLabel } from './examLabels'

export function BreakScreen() {
  const t = useT()
  const { toast } = useToast()
  const sectionIndex = useSessionStore((s) => s.currentSectionIndex)
  const sections = useSessionStore((s) => s.sections)
  const questionStates = useSessionStore((s) => s.questionStates)
  const navigateTo = useSessionStore((s) => s.navigateTo)
  const setStatus = useSessionStore((s) => s.setStatus)
  const setTimeRemaining = useSessionStore((s) => s.setTimeRemaining)

  const [starting, setStarting] = React.useState(false)

  const finished = sections[sectionIndex]
  const next = sections[sectionIndex + 1]

  const progress = React.useMemo(() => {
    if (!finished) return { answered: 0, total: 0 }
    const answered = finished.questions.filter((q) => {
      const a = questionStates[q.id]?.answer
      return a != null && a !== ''
    }).length
    return { answered, total: finished.questions.length }
  }, [finished, questionStates])

  // Persist the section change BEFORE activating, then adopt the server's
  // authoritative remaining time for the new section. This matters for exams
  // with per-section time_limit: the PATCH starts the new section's clock
  // (section_started_at) server-side, and we reset the display timer from the
  // server instead of carrying over the previous section's countdown.
  //
  // This PATCH is the ONLY way a section advances — the server refuses backward
  // moves and stamps the new module's clock here — so a refusal has to be
  // honoured. If the server says no on a rule (the whole-exam clock has run
  // out), walking into the next section locally would just leave the student in
  // a module where every write is rejected; send them to submit instead. A bare
  // network hiccup still falls through to local navigation, and the next
  // autosave re-syncs.
  const begin = async () => {
    const nextIndex = sectionIndex + 1
    const meta = useSessionStore.getState().meta
    setStarting(true)
    if (meta?.sessionId) {
      try {
        const detail = await sessionAPI.autoSave(meta.sessionId, {
          currentSection: nextIndex + 1, // 1-indexed
          currentQuestion: 1,
          clientSessionData: { questions: useSessionStore.getState().questionStates },
        })
        setTimeRemaining(detail.serverTimeRemaining ?? detail.timeRemaining ?? 0)
      } catch (err) {
        const { code, message } = parseApiError(err)
        if (code === 'EXAM_SESSION_ERROR') {
          toast({ variant: 'error', title: t('testEngine.break.cannotContinue'), description: message })
          setStarting(false)
          setStatus('review')
          return
        }
      }
    }
    navigateTo(nextIndex, 0)
    setStatus('active')
  }

  return (
    <div className="flex flex-1 items-center justify-center bg-white p-6">
      <div className="w-full max-w-xl text-center">
        <CheckCircle2 className="mx-auto h-14 w-14 text-bb-blue" />
        <h2 className="mt-5 text-[28px] font-bold text-bb-ink">
          {t('testEngine.break.heading')}
        </h2>
        <p className="mt-2 font-exam text-[19px] text-bb-ink">
          {t('testEngine.break.summary', {
            answered: progress.answered,
            total: progress.total,
            section: sectionLabel(sections, sectionIndex, t),
          })}
        </p>
        {next ? (
          <>
            <div className="mx-auto mt-8 max-w-sm rounded-lg border border-bb-choice bg-bb-strip px-5 py-4 text-left">
              <p className="text-xs font-semibold uppercase tracking-wide text-neutral-600">
                {t('testEngine.break.upNext')}
              </p>
              <p className="mt-0.5 text-[19px] font-bold text-bb-ink">
                {sectionLabel(sections, sectionIndex + 1, t)}
              </p>
              <p className="text-[15px] text-neutral-700">
                {t('testEngine.questionsCount', { count: next.questions.length })}
              </p>
            </div>
            <Button
              className="mt-8 rounded-full bg-bb-blue px-10 py-3 text-[17px] font-bold text-white hover:bg-bb-blueDark"
              onClick={begin}
              loading={starting}
            >
              {t('testEngine.break.beginNext')} <ArrowRight className="h-4 w-4" />
            </Button>
          </>
        ) : (
          <Button
            className="mt-8 rounded-full bg-bb-blue px-10 py-3 text-[17px] font-bold text-white hover:bg-bb-blueDark"
            onClick={() => setStatus('review')}
          >
            {t('testEngine.break.reviewAnswers')} <ArrowRight className="h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  )
}
