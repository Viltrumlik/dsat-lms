// Domain: Test Engine
// Description: Loads the Desmos calculator API — the same calculator the
//   official Digital SAT app embeds — once per page, on demand.
//
// On demand because the bundle is large and most students open the calculator
// on a Math module and never on Reading & Writing; there is no reason to pay
// for it at session start. Once per page because Desmos installs a single
// `window.Desmos` global: a second <script> would be pure waste, so the promise
// is module-level and every caller awaits the same load.
'use client'

import * as React from 'react'

/** Only what the panel actually calls. The real API is far wider. */
export interface DesmosInstance {
  resize(): void
  destroy(): void
}

export interface DesmosApi {
  GraphingCalculator(el: HTMLElement, options?: Record<string, unknown>): DesmosInstance
  ScientificCalculator(el: HTMLElement, options?: Record<string, unknown>): DesmosInstance
}

declare global {
  // eslint-disable-next-line no-var
  var Desmos: DesmosApi | undefined
}

// Desmos publishes this key for testing; a deployment sets its own.
const DEMO_KEY = 'dcb31709b452b1cf9dc26972add0fda6'
const API_KEY = process.env.NEXT_PUBLIC_DESMOS_API_KEY || DEMO_KEY
const SRC = `https://www.desmos.com/api/v1.11/calculator.js?apiKey=${API_KEY}`

let pending: Promise<DesmosApi> | null = null

function loadDesmos(): Promise<DesmosApi> {
  if (typeof window === 'undefined') return Promise.reject(new Error('no window'))
  if (window.Desmos) return Promise.resolve(window.Desmos)
  if (pending) return pending

  pending = new Promise<DesmosApi>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${SRC}"]`)
    const script = existing ?? document.createElement('script')
    const done = () => (window.Desmos ? resolve(window.Desmos) : reject(new Error('Desmos missing')))
    script.addEventListener('load', done)
    script.addEventListener('error', () => reject(new Error('Desmos failed to load')))
    if (!existing) {
      script.src = SRC
      script.async = true
      document.head.appendChild(script)
    }
  })
  // A failed load must not be cached — the student may simply have been offline
  // for a moment, and reopening the panel should try again.
  pending.catch(() => {
    pending = null
  })
  return pending
}

export type DesmosStatus = 'idle' | 'loading' | 'ready' | 'error'

/** Fetch the Desmos API. Nothing happens until `enabled` turns true. */
export function useDesmos(enabled: boolean): {
  status: DesmosStatus
  api: DesmosApi | null
  retry: () => void
} {
  const [status, setStatus] = React.useState<DesmosStatus>('idle')
  const [api, setApi] = React.useState<DesmosApi | null>(null)
  // A ref, not `status`, drives the effect: keying it on status would restart
  // the load the moment it failed, forever.
  const started = React.useRef(false)
  const [attempt, setAttempt] = React.useState(0)

  React.useEffect(() => {
    if (!enabled || started.current) return
    started.current = true
    let alive = true
    setStatus('loading')
    loadDesmos().then(
      (loaded) => {
        if (!alive) return
        setApi(loaded)
        setStatus('ready')
      },
      () => alive && setStatus('error')
    )
    return () => {
      alive = false
    }
  }, [enabled, attempt])

  const retry = React.useCallback(() => {
    started.current = false
    setStatus('idle')
    setAttempt((n) => n + 1)
  }, [])

  return { status, api, retry }
}
