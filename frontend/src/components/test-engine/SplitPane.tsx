// Domain: Test Engine
// Description: The resizable two-pane test body. The divider is the official
//   app's grey rule with a dark ◀▶ grab handle; drag or arrow-keys resize it.
// State: ratio lives in sessionStore so it survives navigation + reload.
'use client'

import * as React from 'react'
import { useSessionStore } from '@/lib/stores/sessionStore'
import { useT } from '@/lib/i18n/I18nProvider'

interface SplitPaneProps {
  left: React.ReactNode
  right: React.ReactNode
}

const MIN = 0.2
const MAX = 0.8

export function SplitPane({ left, right }: SplitPaneProps) {
  const t = useT()
  const ratio = useSessionStore((s) => s.splitRatio)
  const setSplitRatio = useSessionStore((s) => s.setSplitRatio)
  const containerRef = React.useRef<HTMLDivElement>(null)
  const [dragging, setDragging] = React.useState(false)

  React.useEffect(() => {
    if (!dragging) return

    const move = (clientX: number) => {
      const el = containerRef.current
      if (!el) return
      const rect = el.getBoundingClientRect()
      if (rect.width === 0) return
      const next = (clientX - rect.left) / rect.width
      setSplitRatio(Math.min(MAX, Math.max(MIN, next)))
    }

    const onMouseMove = (e: MouseEvent) => {
      e.preventDefault()
      move(e.clientX)
    }
    const onTouchMove = (e: TouchEvent) => {
      const touch = e.touches[0]
      if (touch) move(touch.clientX)
    }
    const stop = () => setDragging(false)

    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', stop)
    window.addEventListener('touchmove', onTouchMove)
    window.addEventListener('touchend', stop)
    // Keep the cursor consistent while dragging over the panes' text.
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'

    return () => {
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', stop)
      window.removeEventListener('touchmove', onTouchMove)
      window.removeEventListener('touchend', stop)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
  }, [dragging, setSplitRatio])

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowLeft') {
      e.preventDefault()
      setSplitRatio(ratio - 0.02)
    } else if (e.key === 'ArrowRight') {
      e.preventDefault()
      setSplitRatio(ratio + 0.02)
    } else if (e.key === 'Home') {
      e.preventDefault()
      setSplitRatio(0.5)
    }
  }

  return (
    <div ref={containerRef} className="flex h-full min-h-0 w-full">
      {/* The left child owns its own scrolling (it may host the notes rail). */}
      <div className="min-w-0 overflow-hidden" style={{ flexBasis: `${ratio * 100}%` }}>
        {left}
      </div>

      {/* Divider */}
      <div className="relative flex w-[9px] shrink-0 justify-center">
        <div className="h-full w-[3px] bg-bb-rule" aria-hidden />
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label={t('testEngine.resizePanes')}
          aria-valuenow={Math.round(ratio * 100)}
          aria-valuemin={MIN * 100}
          aria-valuemax={MAX * 100}
          tabIndex={0}
          onMouseDown={(e) => {
            e.preventDefault()
            setDragging(true)
          }}
          onTouchStart={() => setDragging(true)}
          onDoubleClick={() => setSplitRatio(0.5)}
          onKeyDown={onKeyDown}
          className="absolute top-1/2 flex h-11 w-[22px] -translate-y-1/2 cursor-col-resize items-center justify-center rounded-[5px] bg-bb-ink text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bb-blue focus-visible:ring-offset-1"
        >
          <svg viewBox="0 0 24 24" className="pointer-events-none h-4 w-4 fill-current" aria-hidden>
            <path d="M11 6 5.5 12 11 18V6Zm2 0v12l5.5-6L13 6Z" />
          </svg>
        </div>
      </div>

      <div className="min-w-0 flex-1 overflow-y-auto">{right}</div>
    </div>
  )
}
