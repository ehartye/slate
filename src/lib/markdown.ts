import MarkdownIt from 'markdown-it'
import taskLists from 'markdown-it-task-lists'
import hljs from 'highlight.js'
import katex from '@vscode/markdown-it-katex'

const md: MarkdownIt = new MarkdownIt({
  html: false,
  linkify: true,
  breaks: false,
  highlight: (code, lang) => {
    if (lang === 'mermaid') {
      return `<pre class="mermaid">${md.utils.escapeHtml(code)}</pre>`
    }
    if (lang && hljs.getLanguage(lang)) {
      try {
        const inner = hljs.highlight(code, { language: lang }).value
        return `<pre class="hljs"><code>${inner}</code></pre>`
      } catch {
        /* fall through */
      }
    }
    return `<pre class="hljs"><code>${md.utils.escapeHtml(code)}</code></pre>`
  },
})

md.use(taskLists)
md.use(katex)

export function renderMarkdown(src: string): string {
  return md.render(src)
}
