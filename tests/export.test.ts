import { describe, it, expect, vi, afterEach } from 'vitest'
import { buildStandaloneHtml, themeFontFamilies, collectMermaidScript } from '../src/lib/export'

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

  it('omits any mermaid script tag when no mermaid bundle is passed', () => {
    const out = buildStandaloneHtml('<pre class="mermaid">graph TD;A--&gt;B</pre>', '', 't')
    expect(out).not.toContain('window.mermaid')
  })

  it('embeds the mermaid bundle and a bootstrap script when provided', () => {
    const out = buildStandaloneHtml('<pre class="mermaid">graph TD;A--&gt;B</pre>', '', 't', '', {
      script: 'globalThis.mermaid = {};',
      theme: 'dark',
    })
    expect(out).toContain('globalThis.mermaid = {};')
    expect(out).toContain("window.mermaid.initialize({ startOnLoad: false, theme: \"dark\" })")
    expect(out).toContain("window.mermaid.run({ querySelector: 'pre.mermaid' })")
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

describe('collectMermaidScript', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('returns the fetched bundle text', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, text: () => Promise.resolve('MERMAID_BUNDLE') }))
    expect(await collectMermaidScript()).toBe('MERMAID_BUNDLE')
  })

  it('escapes literal </script sequences so the bundle cannot break out of its <script> tag', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, text: () => Promise.resolve('a</script>b') }))
    const script = await collectMermaidScript()
    expect(script).not.toContain('</script>')
    expect(script).toContain('<\\/script>')
  })

  it('returns empty string when the fetch response is not ok', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }))
    expect(await collectMermaidScript()).toBe('')
  })

  it('returns empty string when fetch throws', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network')))
    expect(await collectMermaidScript()).toBe('')
  })
})
