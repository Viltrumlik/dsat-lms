// Domain: Test Engine
// Description: Maps DOM text selections to character offsets in a container's
//   plain text (and back), so highlights survive a reload / re-render.
// Used by the Bluebook "Highlights & Notes" annotation layer.

import type { Annotation } from '@/types'

/** Text nodes in document order, skipping anything we injected ourselves. */
function textNodes(container: HTMLElement): Text[] {
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      // Ignore KaTeX's duplicated MathML tree — it is not visible text and
      // would double-count every equation's characters.
      let el = node.parentElement
      while (el && el !== container) {
        if (el.tagName === 'ANNOTATION' || el.classList.contains('katex-mathml')) {
          return NodeFilter.FILTER_REJECT
        }
        el = el.parentElement
      }
      return NodeFilter.FILTER_ACCEPT
    },
  })
  const nodes: Text[] = []
  let n = walker.nextNode()
  while (n) {
    nodes.push(n as Text)
    n = walker.nextNode()
  }
  return nodes
}

/** Concatenated visible text of a container — the coordinate space for offsets. */
export function containerText(container: HTMLElement): string {
  return textNodes(container)
    .map((n) => n.data)
    .join('')
}

/** Absolute offset of (node, offset) within the container's text. */
function offsetOf(container: HTMLElement, node: Node, nodeOffset: number): number | null {
  const nodes = textNodes(container)
  let total = 0
  for (const n of nodes) {
    if (n === node) return total + nodeOffset
    total += n.data.length
  }
  // Selection anchored on an element (e.g. a triple-click) — fall back to the
  // start of the first text node inside it.
  if (node.nodeType === Node.ELEMENT_NODE) {
    const el = node as Element
    const child = el.childNodes[nodeOffset] ?? el.firstChild
    if (child) {
      let acc = 0
      for (const n of nodes) {
        if (child.contains(n) || child === n) return acc
        acc += n.data.length
      }
    }
  }
  return null
}

export interface SelectionRange {
  start: number
  end: number
  text: string
}

/**
 * The current window selection expressed as offsets into `container`, or null
 * when there is no usable selection inside it.
 */
export function getSelectionRange(container: HTMLElement): SelectionRange | null {
  const sel = window.getSelection()
  if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return null

  const range = sel.getRangeAt(0)
  if (!container.contains(range.startContainer) || !container.contains(range.endContainer)) {
    return null
  }

  const start = offsetOf(container, range.startContainer, range.startOffset)
  const end = offsetOf(container, range.endContainer, range.endOffset)
  if (start === null || end === null || start === end) return null

  const [from, to] = start < end ? [start, end] : [end, start]
  const text = containerText(container).slice(from, to).trim()
  if (!text) return null
  return { start: from, end: to, text }
}

/** Screen rect of the current selection — used to place the floating toolbar. */
export function getSelectionRect(): DOMRect | null {
  const sel = window.getSelection()
  if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return null
  const rect = sel.getRangeAt(0).getBoundingClientRect()
  return rect.width || rect.height ? rect : null
}

/** Remove every highlight span we previously injected, restoring plain text. */
export function clearHighlights(container: HTMLElement): void {
  const marks = Array.from(container.querySelectorAll('mark.bb-hl'))
  for (const mark of marks) {
    const parent = mark.parentNode
    if (!parent) continue
    while (mark.firstChild) parent.insertBefore(mark.firstChild, mark)
    parent.removeChild(mark)
  }
  if (marks.length) container.normalize()
}

/**
 * Wrap each annotation's character range in a <mark>. Ranges are applied from
 * the end backwards so earlier offsets stay valid while the DOM is split.
 *
 * Safe to call repeatedly: it clears prior marks first.
 */
export function applyHighlights(
  container: HTMLElement,
  annotations: Annotation[],
  activeId?: string | null
): void {
  clearHighlights(container)
  if (!annotations.length) return

  const ordered = annotations
    .slice()
    .filter((a) => a.end > a.start)
    .sort((a, b) => b.start - a.start)

  for (const ann of ordered) {
    const nodes = textNodes(container)
    let acc = 0
    // Collect the (node, from, to) slices this annotation covers.
    const slices: Array<{ node: Text; from: number; to: number }> = []
    for (const node of nodes) {
      const nodeStart = acc
      const nodeEnd = acc + node.data.length
      acc = nodeEnd
      if (nodeEnd <= ann.start) continue
      if (nodeStart >= ann.end) break
      slices.push({
        node,
        from: Math.max(0, ann.start - nodeStart),
        to: Math.min(node.data.length, ann.end - nodeStart),
      })
    }
    // Split back-to-front so earlier slices keep their node identity.
    for (const slice of slices.reverse()) {
      let target = slice.node
      if (slice.to < target.data.length) target.splitText(slice.to)
      if (slice.from > 0) target = target.splitText(slice.from)

      const mark = document.createElement('mark')
      mark.className = 'bb-hl'
      mark.dataset.color = ann.color
      mark.dataset.underline = String(ann.underline)
      mark.dataset.annotationId = ann.id
      if (activeId === ann.id) mark.dataset.active = 'true'
      if (ann.note) mark.dataset.hasNote = 'true'
      target.parentNode?.insertBefore(mark, target)
      mark.appendChild(target)
    }
  }
}

/** True when two ranges share any character. */
export function overlaps(a: { start: number; end: number }, b: { start: number; end: number }) {
  return a.start < b.end && b.start < a.end
}

let counter = 0
/** Stable-enough id for a new annotation (no crypto dependency in tests). */
export function annotationId(): string {
  counter += 1
  return `a${Date.now().toString(36)}${counter.toString(36)}`
}
