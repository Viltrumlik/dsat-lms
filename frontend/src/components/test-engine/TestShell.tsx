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
import { shouldBlock, useFullscreen } from '@/lib/hooks/useFullscreen'
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
import { FullscreenBlocker, FullscreenStart } from './FullscreenGate'
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

  // An invigilated paper is sat in full screen. The browser only grants that
  // from a user gesture, so the paper waits behind a Begin screen — the click
  // there IS the gesture — and goes back behind a block the moment the student
  // leaves. `begun` is what separates "not started yet" from "walked out".
  const requiresFullscreen = useSessionStore((s) => s.meta?.requiresFullscreen ?? false)
  const examTitle = useSessionStore((s) => s.meta?.examTitle ?? '')
  const sectionCount = useSessionStore((s) => s.sections.length)
  const fullscreen = useFullscreen()
  const [begun, setBegun] = React.useState(false)

  // Directions belong to the section — close them when the section changes.
  const sectionIndex = useSessionStore((s) => s.currentSectionIndex)
  React.useEffect(() => {
    setDirectionsOpen(false)
  }, [sectionIndex])

  const blocked = shouldBlock({
    requiresFullscreen,
    begun,
    everEntered: fullscreen.everEntered,
    isFullscreen: fullscreen.isFullscreen,
  })

  useExamShortcuts({
    enabled: status === 'active' && !submitOpen && !directionsOpen && !blocked,
  })

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

  if (requiresFullscreen && !begun) {
    return (
      <FullscreenStart
        examTitle={examTitle}
        sectionCount={sectionCount}
        questionCount={totalCount}
        supported={fullscreen.supported}
        onBegin={() => {
          // Fire and forget: a browser that refuses (or does not support it)
          // must not keep the student out of their own exam.
          void fullscreen.enter()
          setBegun(true)
        }}
      />
    )
  }

  const blocker = blocked ? (
    <FullscreenBlocker
      exits={fullscreen.exits}
      onReturn={() => void fullscreen.enter()}
      onSubmit={() => {
        void fullscreen.exit()
        void handleSubmit()
      }}
    />
  ) : null

  if (status === 'break') {
    return (
      <div className="flex h-[100dvh] flex-col bg-white">
        <BreakScreen />
        {blocker}
      </div>
    )
  }

  if (status === 'review') {
    return (
      <div className="flex h-[100dvh] flex-col bg-white">
        <ReviewScreen onSubmit={() => setSubmitOpen(true)} />
        {blocker}
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
      {blocker}
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
