// Domain: Test Engine
// Description: Where the calculator window is allowed to be. Pure arithmetic,
//   split out of DesmosPanel so it can be reasoned about (and tested) without a
//   browser.

export interface Box {
  x: number
  y: number
  width: number
  height: number
}

export interface Viewport {
  width: number
  height: number
}

export const MIN_WIDTH = 320
export const MIN_HEIGHT = 320
export const DEFAULT_WIDTH = 460
export const DEFAULT_HEIGHT = 560
export const MARGIN = 12

/**
 * Keep the window inside the viewport — header included, since dragging it back
 * is the only way to reach a window that has left the screen.
 *
 * A viewport of zero is not a tiny screen, it is a screen that has not been
 * measured yet (a hidden tab, a pane that has not laid out). Shrinking the
 * window to its minimum on that reading would be acting on nothing, so the box
 * passes through untouched and is clamped on the next real resize.
 */
export function clampBox(box: Box, viewport: Viewport): Box {
  if (viewport.width <= 0 || viewport.height <= 0) return box

  const width = Math.max(MIN_WIDTH, Math.min(box.width, viewport.width - MARGIN * 2))
  const height = Math.max(MIN_HEIGHT, Math.min(box.height, viewport.height - MARGIN * 2))
  return {
    width,
    height,
    x: Math.min(Math.max(MARGIN, box.x), Math.max(MARGIN, viewport.width - width - MARGIN)),
    y: Math.min(Math.max(MARGIN, box.y), Math.max(MARGIN, viewport.height - height - MARGIN)),
  }
}

/** Opens on the right, clear of the question column. */
export function initialBox(viewport: Viewport): Box {
  // Placing it relative to a viewport that has not been measured would put it
  // off the left edge (0 − width). Start in the corner; the resize handler
  // clamps it properly the moment the page has a size.
  if (viewport.width <= 0 || viewport.height <= 0) {
    return { x: MARGIN, y: MARGIN, width: DEFAULT_WIDTH, height: DEFAULT_HEIGHT }
  }
  return clampBox(
    {
      width: DEFAULT_WIDTH,
      height: DEFAULT_HEIGHT,
      x: viewport.width - DEFAULT_WIDTH - 24,
      y: 88,
    },
    viewport
  )
}
