// Domain: Test Engine
// Description: Full screen for an invigilated paper.
//
// A browser will only grant fullscreen from a USER GESTURE — a click or a key
// press. That single fact shapes everything here: the runner cannot put itself
// into full screen on load, and it cannot silently put itself back when the
// student presses Escape. So the paper is gated behind a Begin button, and
// leaving raises a blocking overlay whose only control is a button that asks
// again. That is as close to "cannot leave" as the web allows, and pretending
// otherwise would be a lie the student discovers at the worst moment.
'use client'

import * as React from 'react'

function element(): Element | null {
  if (typeof document === 'undefined') return null
  return document.fullscreenElement ?? null
}

/**
 * Should the paper be covered right now?
 *
 * Pulled out of the component because the rule it encodes is the one that is
 * easy to get wrong, and getting it wrong locks a student out of an exam they
 * are entitled to sit: blocking is judged on having LEFT full screen, never on
 * the browser having refused to grant it.
 */
export function shouldBlock({
  requiresFullscreen,
  begun,
  everEntered,
  isFullscreen,
}: {
  requiresFullscreen: boolean
  begun: boolean
  everEntered: boolean
  isFullscreen: boolean
}): boolean {
  return requiresFullscreen && begun && everEntered && !isFullscreen
}

export function useFullscreen() {
  const [isFullscreen, setIsFullscreen] = React.useState(false)
  /** How many times the student has left. Recorded, not punished. */
  const [exits, setExits] = React.useState(0)
  /** Whether the browser will grant it at all (iOS Safari on iPhone will not). */
  const [supported, setSupported] = React.useState(true)
  /**
   * Has it EVER been granted in this sitting?
   *
   * This is what "you left full screen" may be judged against — never the
   * request being refused. A browser that will not go full screen (an embedded
   * frame, a locked-down kiosk, an iPhone) would otherwise leave the student
   * behind a Return-to-full-screen wall that no click can ever clear: shut out
   * of their own exam by a rule they cannot satisfy.
   */
  const [everEntered, setEverEntered] = React.useState(false)

  React.useEffect(() => {
    setSupported(
      typeof document !== 'undefined' &&
        typeof document.documentElement?.requestFullscreen === 'function'
    )
    setIsFullscreen(element() !== null)

    const onChange = () => {
      const now = element() !== null
      if (now) setEverEntered(true)
      setIsFullscreen((was) => {
        if (was && !now) setExits((n) => n + 1)
        return now
      })
    }
    document.addEventListener('fullscreenchange', onChange)
    return () => document.removeEventListener('fullscreenchange', onChange)
  }, [])

  /** Must be called from a user gesture. Resolves false if the browser refuses. */
  const enter = React.useCallback(async () => {
    try {
      await document.documentElement.requestFullscreen({ navigationUI: 'hide' })
      setEverEntered(true)
      return true
    } catch {
      return false
    }
  }, [])

  const exit = React.useCallback(async () => {
    try {
      if (element() !== null) await document.exitFullscreen()
    } catch {
      // Already out, or the browser refused. Either way there is nothing to do.
    }
  }, [])

  return { isFullscreen, everEntered, exits, supported, enter, exit }
}
