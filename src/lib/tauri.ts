import { invoke } from '@tauri-apps/api/core'

export const listMarkdownFiles = (folder: string) =>
  invoke<string[]>('list_markdown_files', { folder })

export const readFile = (path: string) => invoke<string>('read_file', { path })

export const writeFile = (path: string, content: string) =>
  invoke<void>('write_file', { path, content })

/** File name from a full path (handles \\ and /). */
export const baseName = (path: string) => path.split(/[\\/]/).pop() ?? path
