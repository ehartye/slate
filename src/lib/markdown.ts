import MarkdownIt from 'markdown-it'
import taskLists from 'markdown-it-task-lists'
import footnote from 'markdown-it-footnote'
import anchor from 'markdown-it-anchor'
import toc from 'markdown-it-table-of-contents'
import mark from 'markdown-it-mark'
import sup from 'markdown-it-sup'
import sub from 'markdown-it-sub'
import kbd from 'markdown-it-kbd'
import githubAlerts from 'markdown-it-github-alerts'
import hljs from 'highlight.js'
import katex from '@vscode/markdown-it-katex'
import DOMPurify from 'dompurify'

// Fences whose language highlight.js has no grammar for, mapped to the closest
// supported one. Apex is Salesforce's Java-shaped language — java highlights it well.
const LANG_ALIASES: Record<string, string> = {
  apex: 'java',
}

const md: MarkdownIt = new MarkdownIt({
  // Raw HTML in a document is passed through and rendered rather than escaped,
  // so `<details>`, `<sub>`, layout `<div>`s etc. work the way they do on
  // GitHub. Everything is run through DOMPurify before it reaches the DOM
  // (see `renderMarkdown`) — a markdown file is untrusted input, and the
  // "Open in browser" export has no CSP to fall back on.
  html: true,
  linkify: true,
  breaks: false,
  highlight: (code, lang) => {
    if (lang === 'mermaid') {
      return `<pre class="mermaid">${md.utils.escapeHtml(code)}</pre>`
    }
    const resolved = lang ? (LANG_ALIASES[lang.toLowerCase()] ?? lang) : ''
    let inner: string
    if (resolved && hljs.getLanguage(resolved)) {
      try {
        inner = hljs.highlight(code, { language: resolved }).value
      } catch {
        inner = md.utils.escapeHtml(code)
      }
    } else {
      // No (or unknown) language fence: auto-detect so bare ``` blocks still
      // get highlighted instead of rendering as flat, uncolored text.
      try {
        inner = hljs.highlightAuto(code).value
      } catch {
        inner = md.utils.escapeHtml(code)
      }
    }
    return `<pre class="hljs"><code>${inner}</code></pre>`
  },
})

md.use(taskLists)
md.use(katex)
md.use(footnote)
// Heading ids + a hover-revealed permalink; the preview already handles in-page
// #anchor clicks, and the table of contents links to these same slugs.
md.use(anchor, {
  permalink: anchor.permalink.linkInsideHeader({
    symbol: '#',
    placement: 'before',
    ariaHidden: true,
    class: 'header-anchor',
  }),
})
md.use(toc, { includeLevel: [1, 2, 3], containerClass: 'table-of-contents' })
md.use(mark)
md.use(sup)
md.use(sub)
md.use(kbd)
md.use(githubAlerts)

// Leading YAML front matter: `---` … `---` at the very top of the document.
const FRONT_MATTER = /^---\r?\n([\s\S]*?)\r?\n---[ \t]*\r?\n?/

/** Render top-level `key: value` front-matter lines as a small metadata card. */
function renderFrontMatter(yaml: string): string {
  const esc = md.utils.escapeHtml
  const rows = yaml
    .split(/\r?\n/)
    .map((line) => {
      const i = line.indexOf(':')
      if (i < 1) return null
      const key = line.slice(0, i).trim()
      const val = line.slice(i + 1).trim().replace(/^["']|["']$/g, '')
      return key ? { key, val } : null
    })
    .filter((r): r is { key: string; val: string } => r !== null)
  if (rows.length === 0) return ''
  const cells = rows
    .map(
      (r) =>
        `<div class="fm-row"><span class="fm-key">${esc(r.key)}</span>` +
        `<span class="fm-val">${esc(r.val)}</span></div>`,
    )
    .join('')
  return `<div class="front-matter">${cells}</div>`
}

/**
 * Strip anything script-executing from rendered HTML while leaving the markup
 * authors actually want (layout tags, `style`, `<details>`, KaTeX's MathML,
 * highlight.js spans). Applied to the whole rendered document because `html:
 * true` lets a source file inject arbitrary markup.
 */
function sanitize(html: string): string {
  return DOMPurify.sanitize(html, {
    // KaTeX emits MathML and mermaid/SVG markup can appear inline.
    USE_PROFILES: { html: true, svg: true, svgFilters: true, mathMl: true },
    // `target="_blank"` on author-written anchors, and the `align` attributes
    // GitHub-flavored raw HTML tables commonly use.
    ADD_ATTR: ['target', 'align'],
    // Frames can't render under the app's `default-src 'self'` CSP anyway, and
    // allowing them in the browser export would smuggle remote script back in.
    FORBID_TAGS: ['iframe', 'frame', 'frameset', 'object', 'embed', 'base'],
    // DOMPurify's clobbering guard drops any `id` whose value happens to be a
    // `document` property — which silently kills heading anchors and TOC links
    // for ordinary headings like "Title", "Location", or "Images". The guard
    // only matters for code doing named `document.<x>` lookups; this app uses
    // `document.getElementById`/`querySelector`, which named access can't
    // shadow. Script execution is blocked by the tag/attribute allowlist above,
    // independently of this setting.
    SANITIZE_DOM: false,
  })
}

export function renderMarkdown(src: string): string {
  let card = ''
  const m = src.match(FRONT_MATTER)
  if (m) {
    card = renderFrontMatter(m[1])
    src = src.slice(m[0].length)
  }
  return sanitize(card + md.render(src))
}
