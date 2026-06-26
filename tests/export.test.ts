import { describe, it, expect } from 'vitest'
import { buildStandaloneHtml } from '../src/lib/export'

describe('buildStandaloneHtml', () => {
  it('embeds rendered body, theme css, and title', () => {
    const out = buildStandaloneHtml('<h1>Hi</h1>', ':root{--bg:#000}', 'notes.md')
    expect(out.startsWith('<!DOCTYPE html>')).toBe(true)
    expect(out).toContain('<title>notes.md</title>')
    expect(out).toContain(':root{--bg:#000}')
    expect(out).toContain('<h1>Hi</h1>')
    expect(out).toContain('class="preview"')
  })
})
