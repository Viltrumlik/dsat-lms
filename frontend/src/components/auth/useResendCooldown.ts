// Domain: Public (auth)
// Description: The countdown on a "send it again" button.
//
// The server's cooldown is the real limit; this only shows it. Two reasons it
// is worth having on the client at all: a disabled button with "42s" on it
// stops the request being made, which is the cheapest email you never send —
// and a student who can see the number stops clicking, which is the behaviour
// the whole limit exists to produce.
//
// Seeded from the server's `Retry-After` on a 429, so the two never disagree.
'use client'

import * as React from 'react'

export function useResendCooldown(initialSeconds = 0) {
  const [seconds, setSeconds] = React.useState(initialSeconds)

  React.useEffect(() => {
    if (seconds <= 0) return
    const id = setTimeout(() => setSeconds((n) => n - 1), 1000)
    return () => clearTimeout(id)
  }, [seconds])

  return {
    seconds,
    active: seconds > 0,
    start: (value: number) => setSeconds(Math.max(0, Math.ceil(value))),
  }
}

/** Seconds the server asked us to wait, or a sensible default. */
export function retryAfterFrom(error: unknown, fallback = 60): number {
  const header = (error as { response?: { headers?: Record<string, string> } })?.response?.headers?.[
    'retry-after'
  ]
  const parsed = Number(header)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}
