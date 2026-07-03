import katexCss from 'katex/dist/katex.min.css?inline'
import proseCss from './styles/prose.css?inline'

// .preview prose styling is the shared prose.css (same rules the in-app preview
// uses, so the two never drift). Only the standalone-page container differs:
// the export owns the body background and the .preview page padding, which in the
// app are provided by .preview-pane / .preview-scroll instead.
const CONTAINER = `body{margin:0;background:var(--prose-bg,#fff);}
.preview{padding:56px 24px;}`

const GENERIC_FAMILIES = /^(sans-serif|serif|monospace|system-ui|ui-monospace|ui-serif|ui-sans-serif|ui-rounded|cursive|fantasy|math|emoji)$/i

/** Named (non-generic) font families referenced by a theme's font variables. */
export function themeFontFamilies(themeCss: string): string[] {
  const fams = new Set<string>()
  for (const m of themeCss.matchAll(/--(?:ui|editor|prose|prose-heading)-font\s*:\s*([^;]+)/g)) {
    for (const part of m[1].split(',')) {
      const name = part.trim().replace(/^['"]|['"]$/g, '')
      if (name && !GENERIC_FAMILIES.test(name)) fams.add(name)
    }
  }
  return [...fams]
}

function toBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf)
  let bin = ''
  const CHUNK = 0x8000 // avoid arg-spread stack limits on large fonts
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK))
  }
  return btoa(bin)
}

/**
 * Collect @font-face rules for the families the theme references, with each
 * font fetched from the app bundle and inlined as a base64 data URI — so
 * app-bundled faces (Orbitron, EB Garamond, …) survive into the standalone
 * export. System-installed fonts have no @font-face here and resolve (or fall
 * back) in the browser exactly as they would in the app.
 */
export async function collectThemeFontCss(themeCss: string): Promise<string> {
  const wanted = new Set(themeFontFamilies(themeCss).map((f) => f.toLowerCase()))
  if (wanted.size === 0) return ''
  let out = ''
  for (const sheet of Array.from(document.styleSheets)) {
    let rules: CSSRuleList
    try {
      rules = sheet.cssRules
    } catch {
      continue // cross-origin sheet — nothing of ours in there
    }
    for (const rule of Array.from(rules)) {
      if (!(rule instanceof CSSFontFaceRule)) continue
      const fam = rule.style.getPropertyValue('font-family').trim().replace(/^['"]|['"]$/g, '')
      if (!wanted.has(fam.toLowerCase())) continue
      // Fontsource splits faces into unicode-range subsets; latin is enough here.
      const range = rule.style.getPropertyValue('unicode-range')
      if (range && !/U\+0000/i.test(range)) continue
      const src = rule.style.getPropertyValue('src')
      const url = src.match(/url\(["']?([^"')]+)["']?\)/)?.[1]
      if (!url) continue
      try {
        const res = await fetch(url)
        if (!res.ok) continue
        const b64 = toBase64(await res.arrayBuffer())
        const style = rule.style.getPropertyValue('font-style') || 'normal'
        const weight = rule.style.getPropertyValue('font-weight') || '400'
        out += `@font-face{font-family:'${fam}';font-style:${style};font-weight:${weight};` +
          `src:url(data:font/woff2;base64,${b64}) format('woff2');}\n`
      } catch {
        /* font fetch failed — the export falls back like a missing system font */
      }
    }
  }
  return out
}

export function buildStandaloneHtml(
  bodyHtml: string,
  themeCss: string,
  title: string,
  fontCss = '',
): string {
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>${title}</title>
<style>${fontCss}</style>
<style>${themeCss}</style>
<style>${katexCss}</style>
<style>${proseCss}</style>
<style>${CONTAINER}</style>
</head><body><div class="preview">${bodyHtml}</div></body></html>`
}
