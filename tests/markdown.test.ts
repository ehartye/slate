import { describe, it, expect } from 'vitest'
import { renderMarkdown } from '../src/lib/markdown'

describe('renderMarkdown', () => {
  it('renders headings and paragraphs', () => {
    expect(renderMarkdown('# Hello')).toContain('<h1>Hello</h1>')
  })
  it('renders GFM tables', () => {
    const md = '| a | b |\n| - | - |\n| 1 | 2 |'
    expect(renderMarkdown(md)).toContain('<table>')
  })
  it('renders task lists', () => {
    expect(renderMarkdown('- [x] done')).toContain('type="checkbox"')
  })
  it('autolinks bare URLs', () => {
    expect(renderMarkdown('see https://example.com')).toContain('<a href="https://example.com"')
  })
})

describe('renderMarkdown extras', () => {
  it('highlights fenced code', () => {
    const out = renderMarkdown('```js\nconst x = 1\n```')
    expect(out).toContain('class="hljs"')
    expect(out).toContain('hljs-keyword') // `const`
  })
  it('renders inline math via KaTeX', () => {
    expect(renderMarkdown('$E=mc^2$')).toContain('class="katex"')
  })
  it('marks mermaid fences for client rendering', () => {
    const out = renderMarkdown('```mermaid\ngraph LR; A-->B\n```')
    expect(out).toContain('<pre class="mermaid">')
    expect(out).toContain('graph LR')
  })
})
