// Helpers for the "Markdown only" toggle: telling markdown files apart from
// other text files, and rendering the latter in the Preview pane.
import { renderMarkdown } from './markdown'

const MD_EXTENSIONS = new Set(['md', 'markdown'])

/** The lowercased extension of `path` (no dot), or '' if it has none. */
export function extensionOf(path: string): string {
  const m = /\.([^./\\]+)$/.exec(path)
  return m ? m[1].toLowerCase() : ''
}

/** Whether `path` is a `.md`/`.markdown` file. */
export function isMarkdownPath(path: string | null): boolean {
  return !!path && MD_EXTENSIONS.has(extensionOf(path))
}

/** A fence of backticks long enough to not be broken out of by any backtick
 *  run already present in `content` (CommonMark requires the closing fence
 *  be at least as long as the opening one). */
function fenceFor(content: string): string {
  const runs = content.match(/`+/g) ?? []
  const longest = runs.reduce((max, run) => Math.max(max, run.length), 0)
  return '`'.repeat(Math.max(3, longest + 1))
}

/** Render a non-markdown text file in the Preview pane: wrap it in a fenced
 *  code block (language guessed from its extension) and reuse the exact same
 *  markdown/highlight.js pipeline as `.md` files — so non-markdown files get
 *  accurate, unmangled syntax highlighting instead of being parsed as prose. */
export function renderNonMarkdownPreview(content: string, path: string): string {
  const fence = fenceFor(content)
  const lang = extensionOf(path)
  return renderMarkdown(`${fence}${lang}\n${content}\n${fence}\n`)
}
