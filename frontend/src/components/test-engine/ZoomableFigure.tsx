// Domain: Test Engine
// Description: A test figure with the app's zoom toolbar (zoom in/out, level,
//   Reset, expand) and a full-screen overlay for close inspection.
'use client'

import * as React from 'react'
import { Maximize2, X, ZoomIn, ZoomOut } from 'lucide-react'
import { useT } from '@/lib/i18n/I18nProvider'

const STEP = 25
const MIN = 50
const MAX = 400

function useZoom() {
  const [zoom, setZoom] = React.useState(100)
  return {
    zoom,
    zoomIn: () => setZoom((z) => Math.min(MAX, z + STEP)),
    zoomOut: () => setZoom((z) => Math.max(MIN, z - STEP)),
    reset: () => setZoom(100),
  }
}

function ZoomControls({
  zoom,
  onZoomIn,
  onZoomOut,
  onReset,
  trailing,
}: {
  zoom: number
  onZoomIn: () => void
  onZoomOut: () => void
  onReset: () => void
  trailing: React.ReactNode
}) {
  const t = useT()
  return (
    <div className="flex items-center justify-end gap-3 px-3 py-1.5">
      <button
        type="button"
        onClick={onZoomIn}
        aria-label={t('testEngine.figure.zoomIn')}
        className="text-bb-ink transition-opacity hover:opacity-70"
      >
        <ZoomIn className="h-5 w-5" />
      </button>
      <button
        type="button"
        onClick={onZoomOut}
        aria-label={t('testEngine.figure.zoomOut')}
        className="text-bb-ink transition-opacity hover:opacity-70"
      >
        <ZoomOut className="h-5 w-5" />
      </button>
      <span className="min-w-[3.25rem] text-center text-sm font-medium tabular-nums text-bb-ink">
        {zoom}%
      </span>
      <button
        type="button"
        onClick={onReset}
        className="text-sm font-medium text-bb-ink hover:underline"
      >
        {t('testEngine.figure.reset')}
      </button>
      <span className="h-5 w-px bg-neutral-400" aria-hidden />
      {trailing}
    </div>
  )
}

export function ZoomableFigure({ src, alt = '' }: { src: string; alt?: string }) {
  const t = useT()
  const inline = useZoom()
  const overlay = useZoom()
  const [expanded, setExpanded] = React.useState(false)

  React.useEffect(() => {
    if (!expanded) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setExpanded(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [expanded])

  return (
    <>
      <figure className="mb-5 w-full max-w-[560px] overflow-hidden rounded-md border border-neutral-400">
        <div className="border-b border-neutral-300 bg-neutral-100">
          <ZoomControls
            zoom={inline.zoom}
            onZoomIn={inline.zoomIn}
            onZoomOut={inline.zoomOut}
            onReset={inline.reset}
            trailing={
              <button
                type="button"
                onClick={() => {
                  overlay.reset()
                  setExpanded(true)
                }}
                aria-label={t('testEngine.figure.expand')}
                className="text-bb-ink transition-opacity hover:opacity-70"
              >
                <Maximize2 className="h-[18px] w-[18px]" />
              </button>
            }
          />
        </div>
        <div className="overflow-auto bg-white p-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={src}
            alt={alt}
            style={{ width: `${inline.zoom}%` }}
            className="mx-auto block max-w-none"
          />
        </div>
      </figure>

      {expanded && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={t('testEngine.figure.expanded')}
          className="fixed inset-0 z-50 flex flex-col bg-black/55"
        >
          <div className="flex justify-end p-3">
            <div className="rounded-lg bg-neutral-200/95 shadow-lg">
              <ZoomControls
                zoom={overlay.zoom}
                onZoomIn={overlay.zoomIn}
                onZoomOut={overlay.zoomOut}
                onReset={overlay.reset}
                trailing={
                  <button
                    type="button"
                    onClick={() => setExpanded(false)}
                    aria-label={t('common.close')}
                    className="text-bb-ink transition-opacity hover:opacity-70"
                  >
                    <X className="h-5 w-5" />
                  </button>
                }
              />
            </div>
          </div>
          <div className="flex-1 overflow-auto px-6 pb-6">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={src}
              alt={alt}
              style={{ width: `${overlay.zoom}%` }}
              className="mx-auto block max-w-none bg-white"
            />
          </div>
        </div>
      )}
    </>
  )
}
