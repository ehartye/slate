import { invoke } from '@tauri-apps/api/core'

export const listMarkdownFiles = (folder: string, showHidden: boolean) =>
  invoke<string[]>('list_markdown_files', { folder, showHidden })

/** Every recognized text/code file (not just markdown) — used when "Markdown
 *  only" mode is off. */
export const listTextFiles = (folder: string, showHidden: boolean) =>
  invoke<string[]>('list_text_files', { folder, showHidden })

export const listSubfolders = (folder: string, showHidden: boolean) =>
  invoke<string[]>('list_subfolders', { folder, showHidden })

/** Open another independent Slate window (blank — no folder/file pre-selected). */
export const openNewWindow = () => invoke<void>('open_new_window')

export const readFile = (path: string) => invoke<string>('read_file', { path })

export const writeFile = (path: string, content: string) =>
  invoke<void>('write_file', { path, content })

/** Resolve a relative `.md` link in `base` to an absolute path, or null if it's
 *  missing or not a markdown file. */
export const resolveMdLink = (base: string, href: string) =>
  invoke<string | null>('resolve_md_link', { base, href })

/** Resolve a relative image `href` in `base` and read it as a `data:` URL, or
 *  null if it's missing, absolute/remote, or not a supported image type. */
export const resolveImageDataUrl = (base: string, href: string) =>
  invoke<string | null>('resolve_image_data_url', { base, href })

/** Read a PDF file's bytes as a `data:application/pdf;base64,...` URL, for
 *  PdfViewer.svelte's bundled PDF.js to load. */
export const readPdfAsDataUrl = (path: string) =>
  invoke<string>('read_pdf_as_data_url', { path })

/** File name from a full path (handles \\ and /). */
export const baseName = (path: string) => path.split(/[\\/]/).pop() ?? path

/** Directory portion of a full path (handles \\ and /), or null if none. */
export const dirName = (path: string) => {
  const m = path.match(/^(.*)[\\/][^\\/]*$/)
  return m ? m[1] : null
}
