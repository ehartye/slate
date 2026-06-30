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

// Fences whose language highlight.js has no grammar for, mapped to the closest
// supported one. Apex is Salesforce's Java-shaped language — java highlights it well.
const LANG_ALIASES: Record<string, string> = {
  apex: 'java',
}

const md: MarkdownIt = new MarkdownIt({
  html: false,
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

export function renderMarkdown(src: string): string {
  let card = ''
  const m = src.match(FRONT_MATTER)
  if (m) {
    card = renderFrontMatter(m[1])
    src = src.slice(m[0].length)
  }
  return card + md.render(src)
}
