import { describe, it, expect, beforeEach } from 'vitest'
import { highlightMatches, clearHighlights, setActiveMatch } from '../src/lib/documentSearch'

let root: HTMLDivElement

beforeEach(() => {
  root = document.createElement('div')
  document.body.appendChild(root)
})

describe('highlightMatches', () => {
  it('wraps a single-node match in a <mark class="find-hit">', () => {
    root.innerHTML = '<p>the quick brown fox</p>'
    const count = highlightMatches(root, 'quick')
    expect(count).toBe(1)
    const mark = root.querySelector('mark.find-hit')
    expect(mark?.textContent).toBe('quick')
    expect(mark?.getAttribute('data-match-index')).toBe('0')
    // Surrounding text is preserved.
    expect(root.querySelector('p')?.textContent).toBe('the quick brown fox')
  })

  it('wraps multiple non-overlapping matches with increasing indices', () => {
    root.innerHTML = '<p>cat sat on cat mat</p>'
    const count = highlightMatches(root, 'cat')
    expect(count).toBe(2)
    const marks = Array.from(root.querySelectorAll('mark.find-hit'))
    expect(marks.map((m) => m.textContent)).toEqual(['cat', 'cat'])
    expect(marks.map((m) => m.getAttribute('data-match-index'))).toEqual(['0', '1'])
  })

  it('matches fuzzily across a run of text within one node', () => {
    root.innerHTML = '<p>markdown editor</p>'
    const count = highlightMatches(root, 'mkdown')
    expect(count).toBe(1)
    expect(root.querySelector('mark.find-hit')?.textContent).toBe('markdown')
  })

  it('finds a match spanning two separate text nodes (e.g. across inline markup)', () => {
    root.innerHTML = '<p>hello <b>world</b> today</p>'
    const count = highlightMatches(root, 'world today')
    expect(count).toBe(1)
    const marks = root.querySelectorAll('mark.find-hit')
    // Split across two marks (one per original text node) sharing the same index.
    expect(marks.length).toBe(2)
    expect(Array.from(marks).every((m) => m.getAttribute('data-match-index') === '0')).toBe(true)
    expect(Array.from(marks).map((m) => m.textContent).join('')).toBe('world today')
  })

  it('skips text inside pre.mermaid blocks', () => {
    root.innerHTML = '<pre class="mermaid">graph TD; cat --> dog;</pre>'
    const count = highlightMatches(root, 'cat')
    expect(count).toBe(0)
    expect(root.querySelector('mark.find-hit')).toBeNull()
  })

  it('returns 0 for an empty query without touching the DOM', () => {
    root.innerHTML = '<p>hello world</p>'
    const count = highlightMatches(root, '')
    expect(count).toBe(0)
    expect(root.innerHTML).toBe('<p>hello world</p>')
  })

  it('returns 0 when nothing matches', () => {
    root.innerHTML = '<p>hello world</p>'
    expect(highlightMatches(root, 'zzz')).toBe(0)
  })
})

describe('clearHighlights', () => {
  it('unwraps marks and restores the original text', () => {
    root.innerHTML = '<p>the quick brown fox</p>'
    highlightMatches(root, 'quick')
    expect(root.querySelector('mark.find-hit')).not.toBeNull()

    clearHighlights(root)

    expect(root.querySelector('mark.find-hit')).toBeNull()
    expect(root.querySelector('p')?.textContent).toBe('the quick brown fox')
  })

  it('is a no-op when there is nothing to clear', () => {
    root.innerHTML = '<p>hello world</p>'
    expect(() => clearHighlights(root)).not.toThrow()
    expect(root.innerHTML).toBe('<p>hello world</p>')
  })
})

describe('setActiveMatch', () => {
  it('toggles the active class on only the targeted match and scrolls it into view', () => {
    root.innerHTML = '<p>cat sat on cat mat</p>'
    highlightMatches(root, 'cat')
    const marks = Array.from(root.querySelectorAll<HTMLElement>('mark.find-hit'))
    let scrolledCount = 0
    marks.forEach((m) => { m.scrollIntoView = () => { scrolledCount++ } })

    setActiveMatch(root, 1)

    expect(marks[0].classList.contains('find-hit-active')).toBe(false)
    expect(marks[1].classList.contains('find-hit-active')).toBe(true)
    expect(scrolledCount).toBe(1)
  })
})
