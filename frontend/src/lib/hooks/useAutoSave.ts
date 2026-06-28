// ═══════════════════════════════════════
// DSAT LMS v2 — Auto-Save Hook
// Domain: Test Engine
// Description: Har 30 soniyada session state'ni serverga saqlaydi.
//              Network xatolik bo'lganda retry qiladi.
// ═══════════════════════════════════════

import { useEffect, useRef, useCallback } from 'react'
import { useSessionStore, selectAutoSavePayload } from '@/lib/stores/sessionStore'
import { sessionAPI } from '@/lib/api/sessions'

interface UseAutoSaveOptions {
  intervalMs?: number    // Default: 30_000 (30 seconds)
  enabled?: boolean      // Default: true
  onError?: (error: Error) => void
}

export function useAutoSave({
  intervalMs = 30_000,
  enabled = true,
  onError,
}: UseAutoSaveOptions = {}) {
  const meta = useSessionStore((s) => s.meta)
  const status = useSessionStore((s) => s.status)
  const currentSectionIndex = useSessionStore((s) => s.currentSectionIndex)
  const currentQuestionIndex = useSessionStore((s) => s.currentQuestionIndex)
  const timeRemaining = useSessionStore((s) => s.timeRemaining)
  const questionStates = useSessionStore((s) => s.questionStates)

  const isSavingRef = useRef(false)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const save = useCallback(async () => {
    if (!meta?.sessionId) return
    if (isSavingRef.current) return  // Avvalgi save hali tugamagan
    if (status !== 'active') return  // Faqat aktiv sessiyada save

    isSavingRef.current = true

    try {
      await sessionAPI.autoSave(meta.sessionId, {
        currentSection: currentSectionIndex + 1,
        currentQuestion: currentQuestionIndex + 1,
        timeRemaining,
        clientSessionData: { questions: questionStates },
      })
    } catch (error) {
      // Save xatoligi — localStorage'da saqlanib turibdi, keyingi urinishda yuboriladi
      if (onError && error instanceof Error) {
        onError(error)
      }
      console.warn('[AutoSave] Failed to sync with server:', error)
    } finally {
      isSavingRef.current = false
    }
  }, [meta?.sessionId, status, currentSectionIndex, currentQuestionIndex, timeRemaining, questionStates, onError])

  // Start/stop interval
  useEffect(() => {
    if (!enabled || !meta?.sessionId || status !== 'active') {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
      return
    }

    intervalRef.current = setInterval(save, intervalMs)

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
    }
  }, [enabled, meta?.sessionId, status, intervalMs, save])

  // Page unload oldidan save
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (status === 'active' && meta?.sessionId) {
        // Sync save (navigator.sendBeacon bilan)
        const payload = JSON.stringify({
          currentSection: currentSectionIndex + 1,
          currentQuestion: currentQuestionIndex + 1,
          timeRemaining,
          clientSessionData: { questions: questionStates },
        })
        navigator.sendBeacon(
          `/api/v1/sessions/${meta.sessionId}/`,
          new Blob([payload], { type: 'application/json' })
        )
        e.preventDefault()
      }
    }

    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [status, meta?.sessionId, currentSectionIndex, currentQuestionIndex, timeRemaining, questionStates])

  return { save }
}
