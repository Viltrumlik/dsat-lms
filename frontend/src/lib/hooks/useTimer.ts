// ═══════════════════════════════════════
// DSAT LMS v2 — Timer Hook
// Domain: Test Engine
// Description: Server-authoritative timer. Client faqat display uchun.
//
// Server: started_at + section.time_limit = absolute deadline
// Client: countdown timer (display only)
// Cheat detection: server auto-save'da tekshiradi
// ═══════════════════════════════════════

import { useEffect, useCallback, useRef } from 'react'
import { useSessionStore } from '@/lib/stores/sessionStore'

interface UseTimerOptions {
  onTimeUp?: () => void  // Vaqt tugaganda callback
}

export function useTimer({ onTimeUp }: UseTimerOptions = {}) {
  const timeRemaining = useSessionStore((s) => s.timeRemaining)
  const isTimerRunning = useSessionStore((s) => s.isTimerRunning)
  const status = useSessionStore((s) => s.status)
  const tickTimer = useSessionStore((s) => s.tickTimer)
  const setTimeRemaining = useSessionStore((s) => s.setTimeRemaining)

  const onTimeUpRef = useRef(onTimeUp)
  onTimeUpRef.current = onTimeUp

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const stop = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }
  }, [])

  useEffect(() => {
    if (status !== 'active' || !isTimerRunning || timeRemaining === null) {
      stop()
      return
    }

    intervalRef.current = setInterval(() => {
      tickTimer()
    }, 1000)

    return stop
  }, [status, isTimerRunning, timeRemaining, tickTimer, stop])

  // Time up detection
  useEffect(() => {
    if (timeRemaining === 0 && onTimeUpRef.current) {
      stop()
      onTimeUpRef.current()
    }
  }, [timeRemaining, stop])

  // Formatted display values
  const minutes = Math.floor((timeRemaining ?? 0) / 60)
  const seconds = (timeRemaining ?? 0) % 60

  const isWarning = timeRemaining !== null && timeRemaining <= 300  // 5 daqiqa qolsa
  const isDanger = timeRemaining !== null && timeRemaining <= 60    // 1 daqiqa qolsa

  const formatted = timeRemaining !== null
    ? `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
    : '--:--'

  return {
    timeRemaining,
    formatted,
    minutes,
    seconds,
    isWarning,
    isDanger,
    isRunning: isTimerRunning,
    setTimeRemaining,
  }
}
