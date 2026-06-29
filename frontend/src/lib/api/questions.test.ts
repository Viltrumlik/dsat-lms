import { describe, it, expect } from 'vitest'
import { cursorFromUrl } from './questions'

describe('cursorFromUrl', () => {
  it('extracts the cursor param from a DRF "next" URL', () => {
    expect(cursorFromUrl('http://localhost:8000/api/v1/questions/?cursor=cD0yMDI0')).toBe('cD0yMDI0')
  })

  it('returns null when there is no next page', () => {
    expect(cursorFromUrl(null)).toBeNull()
  })

  it('returns null when the URL has no cursor param', () => {
    expect(cursorFromUrl('http://localhost:8000/api/v1/questions/?module=math')).toBeNull()
  })

  it('decodes percent-encoded cursor values', () => {
    const url = 'http://x/?cursor=' + encodeURIComponent('p=2&o=1')
    expect(cursorFromUrl(url)).toBe('p=2&o=1')
  })

  it('returns null for a malformed URL', () => {
    expect(cursorFromUrl('not a url')).toBeNull()
  })
})
