import { describe, it, expect } from 'vitest'
import { safeNextPath } from './url'

describe('safeNextPath', () => {
  it('allows internal absolute paths', () => {
    expect(safeNextPath('/dashboard')).toBe('/dashboard')
    expect(safeNextPath('/session/abc?x=1#y')).toBe('/session/abc?x=1#y')
  })

  it('falls back when missing', () => {
    expect(safeNextPath(null)).toBe('/dashboard')
    expect(safeNextPath(undefined)).toBe('/dashboard')
    expect(safeNextPath('')).toBe('/dashboard')
  })

  it('rejects off-app redirect vectors', () => {
    expect(safeNextPath('https://evil.com')).toBe('/dashboard')
    expect(safeNextPath('//evil.com')).toBe('/dashboard')
    expect(safeNextPath('/\\evil.com')).toBe('/dashboard')
    expect(safeNextPath('javascript:alert(1)')).toBe('/dashboard')
    expect(safeNextPath('mailto:x@y.z')).toBe('/dashboard')
  })

  it('honors a custom fallback', () => {
    expect(safeNextPath('//evil.com', '/login')).toBe('/login')
  })
})
