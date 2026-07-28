import { describe, it, expect } from 'vitest'
import { renderMarkdown } from '../src/lib/markdown'

describe('renderMarkdown', () => {
  it('renders headings and paragraphs', () => {
    expect(renderMarkdown('# Hello')).toMatch(/<h1 id="hello"[^>]*>.*Hello/)
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
  it('auto-highlights an unlabeled code fence', () => {
    const out = renderMarkdown('```\nfunction greet() { return "hi" }\n```')
    expect(out).toContain('class="hljs"')
    expect(out).toMatch(/hljs-\w/) // some token class, via auto-detection
  })
  it('highlights apex as java (no native apex grammar)', () => {
    const out = renderMarkdown('```apex\npublic class Foo { Integer x = 1; }\n```')
    expect(out).toContain('class="hljs"')
    expect(out).toContain('hljs-keyword') // `public`/`class` via the java grammar
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

describe('renderMarkdown extended syntax', () => {
  it('renders GitHub-style alerts', () => {
    const out = renderMarkdown('> [!NOTE]\n> Heads up.')
    expect(out).toContain('markdown-alert-note')
    expect(out).toContain('Heads up.')
  })
  it('renders warning alerts with their own class', () => {
    expect(renderMarkdown('> [!WARNING]\n> Careful.')).toContain('markdown-alert-warning')
  })
  it('renders footnotes', () => {
    const out = renderMarkdown('Text[^1]\n\n[^1]: The note.')
    expect(out).toContain('footnote-ref')
    expect(out).toContain('footnotes')
    expect(out).toContain('The note.')
  })
  it('gives headings slug ids for anchor links', () => {
    expect(renderMarkdown('## My Heading')).toMatch(/<h2[^>]*id="my-heading"/)
  })
  it('builds a table of contents from [[toc]]', () => {
    const out = renderMarkdown('[[toc]]\n\n# A\n\n## B')
    expect(out).toContain('table-of-contents')
  })
  it('renders ==highlight==, ^sup^, ~sub~, and [[kbd]]', () => {
    expect(renderMarkdown('==hi==')).toContain('<mark>hi</mark>')
    expect(renderMarkdown('x^2^')).toContain('<sup>2</sup>')
    expect(renderMarkdown('H~2~O')).toContain('<sub>2</sub>')
    expect(renderMarkdown('[[Ctrl]]')).toContain('<kbd>Ctrl</kbd>')
  })
  it('keeps GFM strikethrough working alongside single-tilde sub', () => {
    expect(renderMarkdown('~~gone~~')).toContain('<s>gone</s>')
  })
})

describe('renderMarkdown front matter', () => {
  it('renders a leading YAML block as a metadata card, not an <hr>', () => {
    const out = renderMarkdown('---\ntitle: My Doc\nauthor: Me\n---\n\n# Body')
    expect(out).toContain('front-matter')
    expect(out).toContain('My Doc')
    expect(out).toContain('author')
    expect(out).toMatch(/<h1 id="body"[^>]*>.*Body/)
    // The --- fence must not leak through as a horizontal rule / setext heading.
    expect(out).not.toContain('<hr>')
  })
  it('escapes HTML in front-matter values', () => {
    const out = renderMarkdown('---\ntitle: <script>x\n---\n\nbody')
    expect(out).not.toContain('<script>x')
    expect(out).toContain('&lt;script&gt;x')
  })
  it('leaves a normal --- rule untouched when not at the very top', () => {
    const out = renderMarkdown('intro\n\n---\n\nmore')
    expect(out).toContain('<hr>')
    expect(out).not.toContain('front-matter')
  })
})

describe('renderMarkdown inline HTML', () => {
  it('renders block-level raw HTML instead of escaping it', () => {
    const out = renderMarkdown('<div class="note"><p>Hi</p></div>')
    expect(out).toContain('<div class="note">')
    expect(out).not.toContain('&lt;div')
  })

  it('renders inline raw HTML inside a paragraph', () => {
    const out = renderMarkdown('Press <kbd>Esc</kbd> to go <em>back</em>.')
    expect(out).toContain('<kbd>Esc</kbd>')
    expect(out).toContain('<em>back</em>')
  })

  it('renders collapsible <details> blocks', () => {
    const out = renderMarkdown('<details>\n<summary>More</summary>\n\nBody text\n\n</details>')
    expect(out).toContain('<details>')
    expect(out).toContain('<summary>More</summary>')
  })

  it('keeps markdown working inside raw HTML blocks separated by blank lines', () => {
    const out = renderMarkdown('<div align="center">\n\n**bold**\n\n</div>')
    expect(out).toContain('<div align="center">')
    expect(out).toContain('<strong>bold</strong>')
  })

  it('keeps style attributes and inline <img> tags', () => {
    const out = renderMarkdown('<p style="color: red">red</p>\n<img src="a.png" alt="a" width="20">')
    expect(out).toContain('style="color: red"')
    expect(out).toContain('src="a.png"')
  })

  it('still escapes HTML inside fenced code blocks', () => {
    const out = renderMarkdown('```plaintext\n<div>literal</div>\n```')
    expect(out).toContain('&lt;div&gt;literal&lt;/div&gt;')
    expect(out).not.toContain('<div>literal')
  })

  it('keeps heading ids for anchors whose slug collides with a document property', () => {
    expect(renderMarkdown('# Location')).toMatch(/<h1[^>]*id="location"/)
    expect(renderMarkdown('# Images')).toMatch(/<h1[^>]*id="images"/)
  })
})

describe('renderMarkdown sanitization', () => {
  it('strips <script> tags from raw HTML', () => {
    const out = renderMarkdown('before\n\n<script>alert(1)</script>\n\nafter')
    expect(out).not.toContain('<script')
    expect(out).toContain('before')
    expect(out).toContain('after')
  })

  it('strips inline event handlers', () => {
    const out = renderMarkdown('<img src="x" onerror="alert(1)">')
    expect(out).not.toContain('onerror')
  })

  it('strips javascript: URLs from links', () => {
    const out = renderMarkdown('<a href="javascript:alert(1)">click</a>')
    expect(out).not.toContain('javascript:')
    expect(out).toContain('click')
  })

  it('strips iframes and other remote-content embeds', () => {
    const out = renderMarkdown('<iframe src="https://evil.example"></iframe>\n\n<object data="x"></object>')
    expect(out).not.toContain('<iframe')
    expect(out).not.toContain('<object')
  })

  it('leaves KaTeX math markup intact', () => {
    const out = renderMarkdown('$E=mc^2$')
    expect(out).toContain('class="katex"')
    expect(out).toContain('<math')
  })

  it('leaves mermaid fences intact for client-side rendering', () => {
    const out = renderMarkdown('```mermaid\ngraph LR; A-->B\n```')
    expect(out).toContain('<pre class="mermaid">')
    expect(out).toContain('graph LR')
  })

  it('leaves task-list checkboxes and footnote links intact', () => {
    expect(renderMarkdown('- [x] done')).toContain('type="checkbox"')
    const fn = renderMarkdown('Text[^1]\n\n[^1]: The note.')
    expect(fn).toContain('href="#fn1"')
    expect(fn).toContain('id="fn1"')
  })
})
