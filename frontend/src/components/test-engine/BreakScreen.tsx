// Domain: Test Engine
// Description: Between-section interstitial. Advances to the next section.
'use client'

import * as React from 'react'
import { ArrowRight, CheckCircle2 } from 'lucide-react'
import { useSessionStore } from '@/lib/stores/sessionStore'
import { sessionAPI } from '@/lib/api/sessions'
import { Button } from '@/components/ui/button'

export function BreakScreen() {
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
      } catch {
        // Network hiccup — fall back to local navigation; the next autosave
        // re-syncs and the timer stays server-authoritative on reload.
      }
    }
    navigateTo(nextIndex, 0)
    setStatus('active')
  }

  return (
    <div className="flex flex-1 items-center justify-center p-6">
      <div className="w-full max-w-md rounded-xl border border-border bg-card p-8 text-center shadow-sm">
        <CheckCircle2 className="mx-auto h-12 w-12 text-success" />
        <h2 className="mt-4 text-xl font-bold">Section complete</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          You answered {progress.answered} of {progress.total} questions in{' '}
          {finished?.title || `Section ${finished?.sectionNumber}`}.
        </p>
        {next ? (
          <>
            <div className="mt-6 rounded-lg bg-muted p-4 text-left">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Up next</p>
              <p className="font-semibold">{next.title || `Section ${next.sectionNumber}`}</p>
              <p className="text-sm text-muted-foreground">{next.questions.length} questions</p>
            </div>
            <Button className="mt-6 w-full" onClick={begin} loading={starting}>
              Begin next section <ArrowRight className="h-4 w-4" />
            </Button>
          </>
        ) : (
          <Button className="mt-6 w-full" onClick={() => setStatus('review')}>
            Review answers <ArrowRight className="h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  )
}
