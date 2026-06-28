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
import { parseApiError } from '@/lib/api/errors'
import { FullPageSpinner } from '@/components/ui/spinner'
import { TopBar } from './TopBar'
import { QuestionPane } from './QuestionPane'
import { BottomBar } from './BottomBar'
import { BreakScreen } from './BreakScreen'
import { ReviewScreen } from './ReviewScreen'
import { SubmitDialog } from './SubmitDialog'

export function TestShell() {
  const router = useRouter()
  const { toast } = useToast()
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
        title: 'Submit failed',
        description: parseApiError(err).message,
      })
    }
  }, [router, toast, submitting, queryClient])

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
    toast({ title: 'Test paused', description: 'Resume anytime from your dashboard.' })
    useSessionStore.getState().resetSession()
    router.push('/dashboard')
  }, [router, toast])

  if (status === 'submitting') {
    return <FullPageSpinner label="Grading your test…" />
  }

  if (status === 'break') {
    return (
      <div className="flex h-[100dvh] flex-col bg-background">
        <BreakScreen />
      </div>
    )
  }

  if (status === 'review') {
    return (
      <div className="flex h-[100dvh] flex-col bg-background">
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
    <div className="flex h-[100dvh] flex-col bg-background">
      <TopBar onTimeUp={handleSubmit} onPause={handlePause} />
      <main className="flex-1 overflow-y-auto px-4 py-6 md:px-8">
        <QuestionPane />
      </main>
      <BottomBar />
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
