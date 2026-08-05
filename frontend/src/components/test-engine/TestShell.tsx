// Domain: Test Engine
// Description: Root wrapper for an active session. Wires the timer + auto-save and
//   orchestrates active / break / review / submit. Fullscreen (no app chrome).
// State: reads from sessionStore (Zustand).
'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { useQueryClient } from '@tanstack/react-query'
import { useSessionStore, selectAutoSavePayload } from '@/lib/stores/sessionStore'
import { useAutoSave } from '@/lib/hooks/useAutoSave'
import { queueAnswer, flushAnswers } from '@/lib/hooks/useAnswerSync'
import { sessionAPI } from '@/lib/api/sessions'
import { useToast } from '@/components/ui/toast'
import { useT } from '@/lib/i18n/I18nProvider'
import { parseApiError } from '@/lib/api/errors'
import { FullPageSpinner } from '@/components/ui/spinner'
import { TopBar } from './TopBar'
import { QuestionPane } from './QuestionPane'
import { BottomBar } from './BottomBar'
import { BreakScreen } from './BreakScreen'
import { ReviewScreen } from './ReviewScreen'
import { SubmitDialog } from './SubmitDialog'
import { ExamBanner } from './ExamBanner'
import { DirectionsPanel } from './DirectionsPanel'
import { DesmosPanel } from './DesmosPanel'
import { useExamShortcuts } from './useExamShortcuts'

export function TestShell() {
  const router = useRouter()
  const { toast } = useToast()
  const t = useT()
  const queryClient = useQueryClient()
  useAutoSave()

  const status = useSessionStore((s) => s.status)
  const totalCount = useSessionStore((s) =>
    s.sections.reduce((n, sec) => n + sec.questions.length, 0)
  )
  const answeredCount = useSessionStore((s) =>
    s.sections.reduce(
      (n, sec) =>
        n +
        sec.questions.filter((q) => {
          const a = s.questionStates[q.id]?.answer
          return a != null && a !== ''
        }).length,
      0
    )
  )

  const [submitOpen, setSubmitOpen] = React.useState(false)
  const [submitting, setSubmitting] = React.useState(false)
  const [directionsOpen, setDirectionsOpen] = React.useState(false)

  // Directions belong to the section — close them when the section changes.
  const sectionIndex = useSessionStore((s) => s.currentSectionIndex)
  React.useEffect(() => {
    setDirectionsOpen(false)
  }, [sectionIndex])

  useExamShortcuts({ enabled: status === 'active' && !submitOpen && !directionsOpen })

  const handleSubmit = React.useCallback(async () => {
    const { meta, questionStates, setStatus } = useSessionStore.getState()
    if (!meta || submitting) return
    setSubmitting(true)
    setStatus('submitting')
    try {
      // Queue the final value for every answered question (each chains AFTER any
      // in-flight write for that question), then await the whole queue so the
      // latest answer has landed before grading reads responses.
      Object.entries(questionStates)
        .filter(([, st]) => st.answer != null && st.answer !== '')
        .forEach(([qid, st]) => queueAnswer(meta.sessionId, qid, String(st.answer)))
      await flushAnswers()
      await sessionAPI.submit(meta.sessionId)
      // Dashboard stats + session history are now stale.
      queryClient.invalidateQueries({ queryKey: ['sessions'] })
      queryClient.invalidateQueries({ queryKey: ['analytics'] })
      setSubmitOpen(false)
      router.replace(`/results/${meta.sessionId}`)
      useSessionStore.getState().resetSession()
    } catch (err) {
      setSubmitting(false)
      useSessionStore.getState().setStatus('review')
      toast({
        variant: 'error',
        title: t('testEngine.submitFailed'),
        description: parseApiError(err).message,
      })
    }
  }, [router, toast, submitting, queryClient, t])

  const handlePause = React.useCallback(async () => {
    const state = useSessionStore.getState()
    if (!state.meta) return
    try {
      await sessionAPI.autoSave(state.meta.sessionId, selectAutoSavePayload(state))
    } catch {
      // best-effort
    }
    try {
      await sessionAPI.pause(state.meta.sessionId)
    } catch {
      // best-effort
    }
    toast({ title: t('testEngine.paused.title'), description: t('testEngine.paused.desc') })
    useSessionStore.getState().resetSession()
    router.push('/dashboard')
  }, [router, toast, t])

  if (status === 'submitting') {
    return <FullPageSpinner label={t('testEngine.grading')} />
  }

  if (status === 'break') {
    return (
      <div className="flex h-[100dvh] flex-col bg-white">
        <BreakScreen />
      </div>
    )
  }

  if (status === 'review') {
    return (
      <div className="flex h-[100dvh] flex-col bg-white">
        <ReviewScreen onSubmit={() => setSubmitOpen(true)} />
        <SubmitDialog
          open={submitOpen}
          onOpenChange={setSubmitOpen}
          unansweredCount={totalCount - answeredCount}
          totalCount={totalCount}
          submitting={submitting}
          onConfirm={handleSubmit}
        />
      </div>
    )
  }

  if (status !== 'active') {
    return <FullPageSpinner />
  }

  return (
    <div className="flex h-[100dvh] flex-col bg-white">
      <TopBar
        onTimeUp={handleSubmit}
        onPause={handlePause}
        directionsOpen={directionsOpen}
        onToggleDirections={() => setDirectionsOpen((v) => !v)}
      />
      <div className="relative flex min-h-0 flex-1 flex-col">
        <ExamBanner />
        <main className="min-h-0 flex-1 pt-3">
          <QuestionPane />
        </main>
        <DirectionsPanel open={directionsOpen} onClose={() => setDirectionsOpen(false)} />
      </div>
      <BottomBar />
      {/* Floats above the whole surface — every exam type gets the calculator,
          exactly as the official app does on a Math module. */}
      <DesmosPanel />
      <SubmitDialog
        open={submitOpen}
        onOpenChange={setSubmitOpen}
        unansweredCount={totalCount - answeredCount}
        totalCount={totalCount}
        submitting={submitting}
        onConfirm={handleSubmit}
      />
    </div>
  )
}
