import { describe, expect, it } from 'vitest'
import { shouldBlock } from './useFullscreen'

const base = {
  requiresFullscreen: true,
  begun: true,
  everEntered: true,
  isFullscreen: true,
}

describe('shouldBlock', () => {
  it('leaves an in-full-screen paper alone', () => {
    expect(shouldBlock(base)).toBe(false)
  })

  it('covers the paper once the student leaves full screen', () => {
    expect(shouldBlock({ ...base, isFullscreen: false })).toBe(true)
  })

  it('never blocks a browser that would not grant full screen', () => {
    // The trap: judging on "not in full screen" alone walls a student out of an
    // exam behind a button that can never work.
    expect(shouldBlock({ ...base, everEntered: false, isFullscreen: false })).toBe(false)
  })

  it('does not block before the exam has been begun', () => {
    expect(shouldBlock({ ...base, begun: false, isFullscreen: false })).toBe(false)
  })

  it('does not block a paper that is not sat in full screen', () => {
    expect(
      shouldBlock({ ...base, requiresFullscreen: false, isFullscreen: false })
    ).toBe(false)
  })
})
