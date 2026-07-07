// DOM layer for in-document find: wraps fuzzyFindAll's text-offset matches as
// <mark class="find-hit"> elements inside a live rendered container (the
// Preview pane), without needing to know how the underlying HTML was built.
import { fuzzyFindAll } from './search'

const HIT_CLASS = 'find-hit'
const ACTIVE_CLASS = 'find-hit-active'
const HIT_SELECTOR = `mark.${HIT_CLASS}`
// Diagram source text (pre-mermaid-render) isn't useful to search/highlight,
// and mermaid.run() replaces its contents outright anyway.
const SKIP_SELECTOR = 'pre.mermaid'

interface NodeSpan {
  node: Text
  start: number // offset into the concatenated plain text
  end: number
}

function collectTextNodes(root: Element): NodeSpan[] {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(n) {
      if (!n.nodeValue) return NodeFilter.FILTER_REJECT
      if ((n.parentElement)?.closest(SKIP_SELECTOR)) return NodeFilter.FILTER_REJECT
      return NodeFilter.FILTER_ACCEPT
    },
  })
  const spans: NodeSpan[] = []
  let offset = 0
  let node: Node | null
  while ((node = walker.nextNode())) {
    const text = node as Text
    const len = text.nodeValue!.length
    spans.push({ node: text, start: offset, end: offset + len })
    offset += len
  }
  return spans
}

/** Split `node` at [localStart, localEnd) and wrap that middle piece in a new
 *  <mark>, returning it. Assumes 0 <= localStart < localEnd <= node.length. */
function wrapRange(node: Text, localStart: number, localEnd: number, index: number): HTMLElement {
  if (localEnd < node.length) node.splitText(localEnd)
  const matchNode = localStart > 0 ? node.splitText(localStart) : node
  const mark = document.createElement('mark')
  mark.className = HIT_CLASS
  mark.dataset.matchIndex = String(index)
  matchNode.parentNode!.insertBefore(mark, matchNode)
  mark.appendChild(matchNode)
  return mark
}

/** Remove every `<mark class="find-hit">` under `root`, restoring plain text
 *  (merging adjacent text nodes split during highlighting back together). */
export function clearHighlights(root: Element): void {
  const marks = root.querySelectorAll(HIT_SELECTOR)
  if (marks.length === 0) return
  marks.forEach((mark) => {
    const parent = mark.parentNode!
    while (mark.firstChild) parent.insertBefore(mark.firstChild, mark)
    parent.removeChild(mark)
  })
  root.normalize()
}

/**
 * Highlight every fuzzy match of `query` under `root` (call `clearHighlights`
 * first if `root` may already carry marks from a previous query). Returns the
 * number of matches found, in document order — callers index into that same
 * order via `setActiveMatch`.
 */
export function highlightMatches(root: Element, query: string): number {
  if (!query) return 0
  const spans = collectTextNodes(root)
  const text = spans.map((s) => s.node.nodeValue).join('')
  const matches = fuzzyFindAll(text, query)
  if (matches.length === 0) return 0

  // Wrap in reverse (node-major, match-major) so earlier splitText() calls in
  // the same pass never invalidate offsets we still need to consume.
  for (let si = spans.length - 1; si >= 0; si--) {
    const span = spans[si]
    for (let mi = matches.length - 1; mi >= 0; mi--) {
      const m = matches[mi]
      const start = Math.max(m.start, span.start)
      const end = Math.min(m.end, span.end)
      if (start >= end) continue
      wrapRange(span.node, start - span.start, end - span.start, mi)
    }
  }
  return matches.length
}

/** Mark the match at `index` as active (highlighted distinctly) and scroll it
 *  into view; all other matches keep the plain hit style. */
export function setActiveMatch(root: Element, index: number): void {
  const marks = Array.from(root.querySelectorAll<HTMLElement>(HIT_SELECTOR))
  let target: HTMLElement | null = null
  for (const mark of marks) {
    const isActive = Number(mark.dataset.matchIndex) === index
    mark.classList.toggle(ACTIVE_CLASS, isActive)
    if (isActive && !target) target = mark
  }
  target?.scrollIntoView({ block: 'center', behavior: 'smooth' })
}
