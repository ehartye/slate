import { describe, it, expect } from 'vitest'
import {
  extensionOf,
  isMarkdownPath,
  isPdfPath,
  isImagePath,
  isViewerPath,
  renderNonMarkdownPreview,
} from '../src/lib/fileKind'

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

describe('isPdfPath', () => {
  it('accepts .pdf, case-insensitively', () => {
    expect(isPdfPath('/docs/report.pdf')).toBe(true)
    expect(isPdfPath('/docs/REPORT.PDF')).toBe(true)
  })
  it('rejects other extensions and null', () => {
    expect(isPdfPath('/docs/a.md')).toBe(false)
    expect(isPdfPath('/docs/a.txt')).toBe(false)
    expect(isPdfPath(null)).toBe(false)
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

describe('isImagePath', () => {
  it('recognizes the image formats the viewer can render', () => {
    expect(isImagePath('/pics/shot.png')).toBe(true)
    expect(isImagePath('C:\pics\Photo.JPG')).toBe(true)
    expect(isImagePath('/pics/anim.gif')).toBe(true)
    expect(isImagePath('/pics/logo.svg')).toBe(true)
  })
  it('rejects everything else, including null', () => {
    expect(isImagePath('/docs/notes.md')).toBe(false)
    expect(isImagePath('/docs/paper.pdf')).toBe(false)
    expect(isImagePath('/docs/Makefile')).toBe(false)
    expect(isImagePath(null)).toBe(false)
  })
})

describe('isViewerPath', () => {
  it('is true for the formats that open in their own viewer, not the editor', () => {
    // What +page.svelte and tabs.ts actually need to know: this tab has no
    // editable text behind it, so the editor pane and its rail stay hidden.
    expect(isViewerPath('/docs/paper.pdf')).toBe(true)
    expect(isViewerPath('/pics/shot.png')).toBe(true)
  })
  it('is false for text, which is what CodeMirror backs', () => {
    expect(isViewerPath('/docs/notes.md')).toBe(false)
    expect(isViewerPath('/src/main.rs')).toBe(false)
    expect(isViewerPath('/project/.gitignore')).toBe(false)
    expect(isViewerPath(null)).toBe(false)
  })
})
