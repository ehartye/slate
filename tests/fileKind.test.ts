import { describe, it, expect } from 'vitest'
import { extensionOf, isMarkdownPath, renderNonMarkdownPreview } from '../src/lib/fileKind'

describe('extensionOf', () => {
  it('returns the lowercased extension', () => {
    expect(extensionOf('/docs/Notes.MD')).toBe('md')
    expect(extensionOf('C:\\code\\main.RS')).toBe('rs')
  })
  it('returns an empty string when there is no extension', () => {
    expect(extensionOf('/docs/Dockerfile')).toBe('')
  })
})

describe('isMarkdownPath', () => {
  it('accepts .md and .markdown, case-insensitively', () => {
    expect(isMarkdownPath('/docs/a.md')).toBe(true)
    expect(isMarkdownPath('/docs/a.MARKDOWN')).toBe(true)
  })
  it('rejects other extensions and null', () => {
    expect(isMarkdownPath('/docs/a.txt')).toBe(false)
    expect(isMarkdownPath('/src/main.rs')).toBe(false)
    expect(isMarkdownPath(null)).toBe(false)
  })
})

describe('renderNonMarkdownPreview', () => {
  it('renders the file as a syntax-highlighted code block', () => {
    const out = renderNonMarkdownPreview('const x = 1\n', '/src/app.js')
    expect(out).toContain('class="hljs"')
    expect(out).toContain('hljs-keyword') // `const`, via the js grammar
  })
  it('preserves line breaks (does not reflow as markdown prose)', () => {
    const out = renderNonMarkdownPreview('line one\nline two\nline three', '/notes.txt')
    // Would collapse onto one line if this went through the raw markdown
    // paragraph pipeline instead of a code fence.
    expect(out).toContain('line one\nline two\nline three')
  })
  it('escapes HTML-significant characters in unrecognized-language content', () => {
    const out = renderNonMarkdownPreview('<script>alert(1)</script>', '/notes.txt')
    expect(out).not.toContain('<script>alert(1)</script>')
  })
  it('widens the fence so embedded backtick runs cannot break out of the code block', () => {
    const content = 'here is ```a nested fence``` inline'
    const out = renderNonMarkdownPreview(content, '/notes.txt')
    // The whole thing should render as one code block, not get split by the
    // embedded backticks into separate markdown constructs.
    expect(out).toContain('<pre')
    expect((out.match(/<pre/g) ?? []).length).toBe(1)
  })
})
