// Helpers for the "Markdown only" toggle: telling markdown files apart from
// other text files (and PDFs), and rendering the former in the Preview pane.
import { renderMarkdown } from './markdown'

const MD_EXTENSIONS = new Set(['md', 'markdown'])
const PDF_EXTENSIONS = new Set(['pdf'])
// Kept in step with IMAGE_EXTENSIONS in src-tauri/src/files.rs, which decides
// what `read_image_as_data_url` will actually open.
const IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg', 'ico'])

/** The lowercased extension of `path` (no dot), or '' if it has none. */
export function extensionOf(path: string): string {
  const m = /\.([^./\\]+)$/.exec(path)
  return m ? m[1].toLowerCase() : ''
}

/** Whether `path` is a `.md`/`.markdown` file. */
export function isMarkdownPath(path: string | null): boolean {
  return !!path && MD_EXTENSIONS.has(extensionOf(path))
}

/** Whether `path` is a `.pdf` file — a binary format, handled by its own
 *  viewer (PdfViewer.svelte) rather than CodeMirror/the markdown pipeline. */
export function isPdfPath(path: string | null): boolean {
  return !!path && PDF_EXTENSIONS.has(extensionOf(path))
}

/** Whether `path` is an image — like PDF, a binary format with its own viewer
 *  (ImageViewer.svelte) rather than CodeMirror/the markdown pipeline. */
export function isImagePath(path: string | null): boolean {
  return !!path && IMAGE_EXTENSIONS.has(extensionOf(path))
}

/** Whether `path` opens in a viewer of its own instead of the text editor.
 *
 *  The distinction the layout actually cares about is "has editable text
 *  behind it" — not which specific binary format this is — so the editor
 *  pane, its rail, and the scroll-position bookkeeping ask this rather than
 *  testing each viewer format separately and drifting apart as formats are
 *  added. */
export function isViewerPath(path: string | null): boolean {
  return isPdfPath(path) || isImagePath(path)
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
