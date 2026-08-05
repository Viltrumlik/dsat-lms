// Domain: Test Engine
// Description: The Bluebook calculator — a floating Desmos window with the
//   graphing and scientific calculators side by side in its header, draggable by
//   that header and resizable from its corner.
//
// It floats rather than docking because a calculator that takes a column of the
// screen takes it from the question. Dragging is the whole point: the student
// moves it off whatever it is covering.
//
// Both calculators are built once and kept alive behind the tabs — switching is
// a `display` toggle, not a teardown, so a graph survives a trip to the
// scientific and back. Same reason the window itself is hidden rather than
// unmounted when closed. Desmos measures its container on creation and needs a
// resize() nudge whenever it goes from hidden to shown, or it draws into the
// zero-sized box it was born in.
'use client'

import * as React from 'react'
import { GripVertical, X } from 'lucide-react'
import { useDesmos, type DesmosInstance } from '@/lib/hooks/useDesmos'
import { useSessionStore } from '@/lib/stores/sessionStore'
import { useT } from '@/lib/i18n/I18nProvider'
import { cn } from '@/lib/utils/cn'
import { clampBox, initialBox, type Box } from './desmosGeometry'

type Tab = 'graphing' | 'scientific'

const viewport = () =>
  typeof window === 'undefined'
    ? { width: 0, height: 0 }
    : { width: window.innerWidth, height: window.innerHeight }

const firstBox = (): Box => initialBox(viewport())

export function DesmosPanel() {
  const t = useT()
  const open = useSessionStore((s) => s.calculatorOpen)
  const tab = useSessionStore((s) => s.calculatorTab)
  const setOpen = useSessionStore((s) => s.setCalculatorOpen)
  const setTab = useSessionStore((s) => s.setCalculatorTab)

  // Mount on first open, then never unmount — see the header comment.
  const [mounted, setMounted] = React.useState(false)
  React.useEffect(() => {
    if (open) setMounted(true)
  }, [open])

  const { status, api, retry } = useDesmos(mounted)

  const [box, setBox] = React.useState<Box>(firstBox)
  const drag = React.useRef<{ mode: 'move' | 'resize'; startX: number; startY: number; from: Box } | null>(null)

  const graphingRef = React.useRef<HTMLDivElement>(null)
  const scientificRef = React.useRef<HTMLDivElement>(null)
  const instances = React.useRef<{ graphing?: DesmosInstance; scientific?: DesmosInstance }>({})

  // Build both calculators as soon as the API lands.
  //
  // Each is mounted into a node we create and throw away ourselves, never into
  // the ref'd container directly. Desmos records which node a calculator owns
  // and refuses to mount onto a node that already has one — and destroy() does
  // not always release that claim. Since React runs this effect twice in
  // development, mounting into the same container the second time raised "this
  // node is already mounted by a view", which killed the scientific calculator
  // and left an empty box behind it. A fresh node per mount cannot collide.
  React.useEffect(() => {
    if (!api) return
    const made = instances.current
    const mount = (
      host: HTMLDivElement | null,
      build: (el: HTMLElement) => DesmosInstance
    ): { instance: DesmosInstance; node: HTMLElement } | undefined => {
      if (!host) return undefined
      const node = document.createElement('div')
      node.style.width = '100%'
      node.style.height = '100%'
      host.appendChild(node)
      return { instance: build(node), node }
    }

    const graphing = mount(graphingRef.current, (el) =>
      api.GraphingCalculator(el, {
        expressions: true,
        settingsMenu: false,
        zoomButtons: true,
        border: false,
        // The exam gives no reason to leave the page, and a student who does
        // mid-question loses the question.
        images: false,
        folders: false,
        links: false,
      })
    )
    const scientific = mount(scientificRef.current, (el) =>
      api.ScientificCalculator(el, { border: false })
    )
    made.graphing = graphing?.instance
    made.scientific = scientific?.instance

    return () => {
      graphing?.instance.destroy()
      scientific?.instance.destroy()
      graphing?.node.remove()
      scientific?.node.remove()
      instances.current = {}
    }
  }, [api])

  // Any time the visible calculator's box changes — shown, tab switched,
  // dragged, resized — Desmos has to re-measure.
  React.useEffect(() => {
    if (!open) return
    const id = window.requestAnimationFrame(() => {
      instances.current[tab]?.resize()
    })
    return () => window.cancelAnimationFrame(id)
  }, [open, tab, box.width, box.height])

  // Placed against a real viewport yet? On the server, and in a tab that has not
  // been laid out, the window falls back to the top-left corner — over the
  // question. As soon as a real size arrives, put it where it belongs instead.
  const placed = React.useRef(viewport().width > 0)
  React.useEffect(() => {
    const settle = () => {
      const vp = viewport()
      if (!placed.current && vp.width > 0) {
        placed.current = true
        setBox(initialBox(vp))
        return
      }
      setBox((b) => clampBox(b, vp))
    }
    settle() // the panel mounts on first open, which may be long after load
    window.addEventListener('resize', settle)
    return () => window.removeEventListener('resize', settle)
  }, [])

  // One pointer gesture drives both moving and resizing; only the arithmetic differs.
  React.useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const state = drag.current
      if (!state) return
      const dx = e.clientX - state.startX
      const dy = e.clientY - state.startY
      setBox(
        clampBox(
          state.mode === 'move'
            ? { ...state.from, x: state.from.x + dx, y: state.from.y + dy }
            : { ...state.from, width: state.from.width + dx, height: state.from.height + dy },
          viewport()
        )
      )
    }
    const onUp = () => {
      drag.current = null
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
    }
  }, [])

  const startDrag = (mode: 'move' | 'resize') => (e: React.PointerEvent) => {
    if (e.button !== 0) return
    e.preventDefault()
    drag.current = { mode, startX: e.clientX, startY: e.clientY, from: box }
  }

  if (!mounted) return null

  return (
    <div
      // The exam shortcuts read this marker: keys pressed inside the calculator
      // are the student doing maths, not choosing answer C.
      data-exam-calculator=""
      role="dialog"
      aria-label={t('testEngine.calculator.title')}
      aria-hidden={!open}
      className={cn(
        'fixed z-50 flex-col overflow-hidden rounded-lg border border-neutral-400 bg-white shadow-xl',
        open ? 'flex' : 'hidden'
      )}
      style={{ left: box.x, top: box.y, width: box.width, height: box.height }}
    >
      {/* Header — the two calculators sit side by side, and the whole bar drags. */}
      <div
        onPointerDown={startDrag('move')}
        className="flex shrink-0 cursor-grab items-center gap-2 border-b border-neutral-300 bg-bb-chrome px-2 py-1.5 active:cursor-grabbing"
      >
        <GripVertical className="h-4 w-4 shrink-0 text-neutral-500" aria-hidden />
        <div className="flex flex-1 gap-1" role="tablist" aria-label={t('testEngine.calculator.title')}>
          {(['graphing', 'scientific'] as Tab[]).map((key) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={tab === key}
              // The header drags; a tab must not, or every click would nudge it.
              onPointerDown={(e) => e.stopPropagation()}
              onClick={() => setTab(key)}
              className={cn(
                'rounded px-3 py-1 text-[13px] font-semibold transition-colors',
                tab === key
                  ? 'bg-bb-ink text-white'
                  : 'text-bb-ink hover:bg-white/70'
              )}
            >
              {t(`testEngine.calculator.${key}`)}
            </button>
          ))}
        </div>
        <button
          type="button"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={() => setOpen(false)}
          aria-label={t('testEngine.calculator.close')}
          className="shrink-0 rounded p-1 text-bb-ink hover:bg-white/70"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="relative min-h-0 flex-1">
        {status === 'loading' && (
          <p className="absolute inset-0 flex items-center justify-center text-sm text-neutral-600">
            {t('testEngine.calculator.loading')}
          </p>
        )}
        {status === 'error' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-6 text-center">
            <p className="text-sm text-neutral-700">{t('testEngine.calculator.failed')}</p>
            <button
              type="button"
              onClick={retry}
              className="rounded border border-bb-blue px-3 py-1 text-sm font-semibold text-bb-blue hover:bg-bb-blue hover:text-white"
            >
              {t('testEngine.calculator.retry')}
            </button>
          </div>
        )}
        <div
          ref={graphingRef}
          className={cn('h-full w-full', tab === 'graphing' ? 'block' : 'hidden')}
        />
        <div
          ref={scientificRef}
          className={cn('h-full w-full', tab === 'scientific' ? 'block' : 'hidden')}
        />
      </div>

      {/* Resize grip */}
      <div
        onPointerDown={startDrag('resize')}
        aria-hidden
        className="absolute bottom-0 right-0 h-4 w-4 cursor-nwse-resize"
        style={{
          background:
            'linear-gradient(135deg, transparent 0 45%, rgb(148 163 184) 45% 55%, transparent 55% 70%, rgb(148 163 184) 70% 80%, transparent 80%)',
        }}
      />
    </div>
  )
}
