import { describe, expect, it } from 'vitest'
import {
  clampBox,
  initialBox,
  DEFAULT_HEIGHT,
  DEFAULT_WIDTH,
  MARGIN,
  MIN_HEIGHT,
  MIN_WIDTH,
} from './desmosGeometry'

const DESKTOP = { width: 1440, height: 900 }

describe('clampBox', () => {
  it('leaves a window that is already on screen alone', () => {
    const box = { x: 200, y: 100, width: 460, height: 560 }
    expect(clampBox(box, DESKTOP)).toEqual(box)
  })

  it('pulls a window dragged off the right edge back into view', () => {
    const box = clampBox({ x: 5000, y: 100, width: 460, height: 560 }, DESKTOP)
    expect(box.x).toBe(DESKTOP.width - 460 - MARGIN)
  })

  it('pulls a window dragged off the top-left back into view', () => {
    const box = clampBox({ x: -900, y: -900, width: 460, height: 560 }, DESKTOP)
    expect(box).toMatchObject({ x: MARGIN, y: MARGIN })
  })

  it('shrinks a window that no longer fits the viewport', () => {
    const box = clampBox({ x: 0, y: 0, width: 460, height: 560 }, { width: 420, height: 480 })
    expect(box.width).toBe(420 - MARGIN * 2)
    expect(box.height).toBe(480 - MARGIN * 2)
  })

  it('never shrinks below the minimum, however small the viewport', () => {
    const box = clampBox({ x: 0, y: 0, width: 460, height: 560 }, { width: 200, height: 150 })
    expect(box).toMatchObject({ width: MIN_WIDTH, height: MIN_HEIGHT })
  })

  it('passes through untouched when the viewport has not been measured', () => {
    // A hidden tab reports 0×0. That is "unknown", not "tiny" — collapsing the
    // window to its minimum on that reading would be acting on nothing.
    const box = { x: 900, y: 88, width: 460, height: 560 }
    expect(clampBox(box, { width: 0, height: 0 })).toEqual(box)
  })
})

describe('initialBox', () => {
  it('opens at full size on the right of a desktop', () => {
    const box = initialBox(DESKTOP)
    expect(box).toMatchObject({ width: DEFAULT_WIDTH, height: DEFAULT_HEIGHT, y: 88 })
    expect(box.x).toBe(DESKTOP.width - DEFAULT_WIDTH - 24)
  })

  it('starts in the corner when the viewport has not been measured', () => {
    // 0×0 means "not laid out yet" — computing 0 − width would open it off the
    // left edge, where the header that drags it back is unreachable.
    expect(initialBox({ width: 0, height: 0 })).toEqual({
      x: MARGIN,
      y: MARGIN,
      width: DEFAULT_WIDTH,
      height: DEFAULT_HEIGHT,
    })
  })

  it('fits itself to a small screen instead of opening off it', () => {
    const box = initialBox({ width: 420, height: 640 })
    expect(box.x).toBeGreaterThanOrEqual(MARGIN)
    expect(box.x + box.width).toBeLessThanOrEqual(420 - MARGIN)
  })
})
