import { invoke } from '@tauri-apps/api/core'

export const listMarkdownFiles = (folder: string) =>
  invoke<string[]>('list_markdown_files', { folder })

export const readFile = (path: string) => invoke<string>('read_file', { path })

export const writeFile = (path: string, content: string) =>
  invoke<void>('write_file', { path, content })

/** Resolve a relative `.md` link in `base` to an absolute path, or null if it's
 *  missing or not a markdown file. */
export const resolveMdLink = (base: string, href: string) =>
  invoke<string | null>('resolve_md_link', { base, href })

/** File name from a full path (handles \\ and /). */
export const baseName = (path: string) => path.split(/[\\/]/).pop() ?? path

/** Directory portion of a full path (handles \\ and /), or null if none. */
export const dirName = (path: string) => {
  const m = path.match(/^(.*)[\\/][^\\/]*$/)
  return m ? m[1] : null
}
