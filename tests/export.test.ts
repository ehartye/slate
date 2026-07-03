import { describe, it, expect } from 'vitest'
import { buildStandaloneHtml, themeFontFamilies } from '../src/lib/export'

describe('buildStandaloneHtml', () => {
  it('embeds rendered body, theme css, and title', () => {
    const out = buildStandaloneHtml('<h1>Hi</h1>', ':root{--bg:#000}', 'notes.md')
    expect(out.startsWith('<!DOCTYPE html>')).toBe(true)
    expect(out).toContain('<title>notes.md</title>')
    expect(out).toContain(':root{--bg:#000}')
    expect(out).toContain('<h1>Hi</h1>')
    expect(out).toContain('class="preview"')
  })

  it('embeds font css when provided', () => {
    const out = buildStandaloneHtml('<p>x</p>', '', 't', '@font-face{font-family:Orbitron}')
    expect(out).toContain('@font-face{font-family:Orbitron}')
  })
})

describe('themeFontFamilies', () => {
  const css = `:root{
    --ui-font: 'Hanken Grotesk', 'Segoe UI', system-ui, sans-serif;
    --editor-font: 'Cascadia Mono', 'Consolas', ui-monospace, monospace;
    --prose-font: 'Hanken Grotesk', 'Segoe UI', system-ui, sans-serif;
    --prose-heading-font: 'Orbitron', 'Hanken Grotesk', sans-serif;
  }`

  it('extracts unique named families from the four font variables', () => {
    const fams = themeFontFamilies(css)
    expect(fams).toContain('Orbitron')
    expect(fams).toContain('Hanken Grotesk')
    expect(fams).toContain('Cascadia Mono')
    expect(fams.filter((f) => f === 'Hanken Grotesk')).toHaveLength(1)
  })

  it('skips generic families and keywords', () => {
    const fams = themeFontFamilies(css)
    for (const generic of ['sans-serif', 'serif', 'monospace', 'system-ui', 'ui-monospace']) {
      expect(fams).not.toContain(generic)
    }
  })

  it('returns empty for css without font variables', () => {
    expect(themeFontFamilies(':root{--bg:#000}')).toEqual([])
  })
})
