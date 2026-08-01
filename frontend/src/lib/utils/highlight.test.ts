// @vitest-environment jsdom
// Domain: Test Engine
// Description: Offset-based highlighting — the mechanism that lets a student's
//   highlights survive a reload of the exam.

import { describe, it, expect, beforeEach } from 'vitest'
import {
  annotationId,
  applyHighlights,
  clearHighlights,
  containerText,
  overlaps,
} from './highlight'
import type { Annotation } from '@/types'

function container(html: string): HTMLElement {
  const el = document.createElement('div')
  el.innerHTML = html
  document.body.appendChild(el)
  return el
}

function annotation(partial: Partial<Annotation> & { start: number; end: number }): Annotation {
  return {
    id: partial.id ?? annotationId(),
    target: 'stimulus',
    text: partial.text ?? '',
    color: partial.color ?? 'yellow',
    underline: partial.underline ?? false,
    note: partial.note ?? '',
    ...partial,
  }
}

beforeEach(() => {
  document.body.innerHTML = ''
})

describe('containerText', () => {
  it('concatenates text across elements', () => {
    const el = container('<p>Most ice</p><p> is ice Ih.</p>')
    expect(containerText(el)).toBe('Most ice is ice Ih.')
  })

  it('skips KaTeX MathML so equations are not double-counted', () => {
    const el = container(
      '<p>a <span class="katex"><span class="katex-mathml">x+1</span><span class="katex-html">x+1</span></span> b</p>'
    )
    expect(containerText(el)).toBe('a x+1 b')
  })
})

describe('applyHighlights', () => {
  it('wraps exactly the requested character range', () => {
    const el = container('<p>hexagonal pattern here</p>')
    applyHighlights(el, [annotation({ start: 0, end: 9 })])

    const mark = el.querySelector('mark.bb-hl')
    expect(mark?.textContent).toBe('hexagonal')
    expect(mark?.getAttribute('data-color')).toBe('yellow')
    // The surrounding text is untouched.
    expect(containerText(el)).toBe('hexagonal pattern here')
  })

  it('spans a range that crosses element boundaries', () => {
    const el = container('<p>Most of the </p><p>ice found here</p>')
    applyHighlights(el, [annotation({ start: 8, end: 16 })])

    const marks = Array.from(el.querySelectorAll('mark.bb-hl'))
    expect(marks.map((m) => m.textContent).join('')).toBe('the ice ')
    expect(containerText(el)).toBe('Most of the ice found here')
  })

  it('applies several annotations without shifting each other', () => {
    const el = container('<p>alpha beta gamma</p>')
    applyHighlights(el, [
      annotation({ start: 0, end: 5, color: 'yellow' }),
      annotation({ start: 11, end: 16, color: 'pink' }),
    ])

    const marks = Array.from(el.querySelectorAll('mark.bb-hl'))
    expect(marks.map((m) => m.textContent)).toEqual(['alpha', 'gamma'])
    expect(marks.map((m) => m.getAttribute('data-color'))).toEqual(['yellow', 'pink'])
  })

  it('carries the underline and active flags onto the mark', () => {
    const el = container('<p>alpha beta</p>')
    const a = annotation({ id: 'x1', start: 0, end: 5, underline: true })
    applyHighlights(el, [a], 'x1')

    const mark = el.querySelector('mark.bb-hl')!
    expect(mark.getAttribute('data-underline')).toBe('true')
    expect(mark.getAttribute('data-active')).toBe('true')
    expect(mark.getAttribute('data-annotation-id')).toBe('x1')
  })

  it('is idempotent — re-applying does not nest or duplicate marks', () => {
    const el = container('<p>alpha beta</p>')
    const a = annotation({ start: 0, end: 5 })
    applyHighlights(el, [a])
    applyHighlights(el, [a])

    expect(el.querySelectorAll('mark.bb-hl')).toHaveLength(1)
    expect(containerText(el)).toBe('alpha beta')
  })

  it('restores the original text when highlights are cleared', () => {
    const el = container('<p>alpha beta gamma</p>')
    applyHighlights(el, [annotation({ start: 0, end: 5 }), annotation({ start: 6, end: 10 })])
    clearHighlights(el)

    expect(el.querySelectorAll('mark.bb-hl')).toHaveLength(0)
    expect(containerText(el)).toBe('alpha beta gamma')
  })

  it('ignores a zero-length range', () => {
    const el = container('<p>alpha</p>')
    applyHighlights(el, [annotation({ start: 2, end: 2 })])
    expect(el.querySelectorAll('mark.bb-hl')).toHaveLength(0)
  })
})

describe('overlaps', () => {
  it('detects intersecting ranges and ignores adjacent ones', () => {
    expect(overlaps({ start: 0, end: 5 }, { start: 3, end: 8 })).toBe(true)
    expect(overlaps({ start: 0, end: 5 }, { start: 5, end: 8 })).toBe(false)
  })
})

describe('annotationId', () => {
  it('returns unique ids', () => {
    expect(annotationId()).not.toBe(annotationId())
  })
})
