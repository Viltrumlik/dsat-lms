// ═══════════════════════════════════════
// DSAT LMS v2 — Auto-Save Hook
// Domain: Test Engine
// Description: Har 30 soniyada session state'ni serverga saqlaydi.
//              Network xatolik bo'lganda retry qiladi.
// ═══════════════════════════════════════

import { useEffect, useRef, useCallback } from 'react'
import { useSessionStore } from '@/lib/stores/sessionStore'
import { sessionAPI } from '@/lib/api/sessions'
import { getAccessToken } from '@/lib/api/client'
import { decamelizeKeys } from '@/lib/utils/case'

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
  const currentQuestionIndex = useSessionStore((s) => s.currentQuestionIndex)
  const questionStates = useSessionStore((s) => s.questionStates)

  const isSavingRef = useRef(false)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // time_remaining + current_section are intentionally omitted — see
  // selectAutoSavePayload (server-authoritative clock; forward-only sections).
  const save = useCallback(async () => {
    if (!meta?.sessionId) return
    if (isSavingRef.current) return  // Avvalgi save hali tugamagan
    if (status !== 'active') return  // Faqat aktiv sessiyada save

    isSavingRef.current = true

    try {
      await sessionAPI.autoSave(meta.sessionId, {
        currentQuestion: currentQuestionIndex + 1,
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
  }, [meta?.sessionId, status, currentQuestionIndex, questionStates, onError])

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

  // Flush on tab hide / unload. sendBeacon can't carry an Authorization header,
  // so we use fetch({ keepalive }) — same auth + base URL + snake_case transform
  // as a normal request — which is allowed to outlive the page.
  const flush = useCallback(() => {
    if (status !== 'active' || !meta?.sessionId) return
    const base = process.env.NEXT_PUBLIC_API_URL ?? ''
    const token = getAccessToken()
    const body = JSON.stringify(
      decamelizeKeys({
        currentQuestion: currentQuestionIndex + 1,
        clientSessionData: { questions: questionStates },
      })
    )
    try {
      void fetch(`${base}/api/v1/sessions/${meta.sessionId}/`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body,
        credentials: 'include',
        keepalive: true,
      }).catch(() => {})
    } catch {
      // navigator may reject keepalive on very large bodies — best-effort only
    }
  }, [status, meta?.sessionId, currentQuestionIndex, questionStates])

  useEffect(() => {
    const onPageHide = () => flush()
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') flush()
    }
    window.addEventListener('pagehide', onPageHide)
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      window.removeEventListener('pagehide', onPageHide)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [flush])

  return { save }
}
