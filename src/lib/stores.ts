import { writable } from 'svelte/store'
import type { Theme } from './theme'

export const currentFolder = writable<string | null>(null)
export const files = writable<string[]>([])          // full paths
export const folders = writable<string[]>([])         // subfolders of currentFolder, full paths
export const currentFile = writable<string | null>(null)
export const content = writable<string>('')           // editor text
export const dirty = writable<boolean>(false)
export const reloadTrigger = writable<number>(0)  // bumped on external file reload
export const statusMsg = writable<string>('')         // transient errors/info
export const editorScroll = writable<number>(0)       // 0..1 scroll fraction, for preview sync
export const previewZoom = writable<number>(1)        // preview render scale, persisted

// File-browser filters, persisted
export const mdOnlyMode = writable<boolean>(true)      // false: browse any text file, not just .md
export const showHiddenFiles = writable<boolean>(false) // true: include dotfiles/dot-dirs

// Layout collapse state
export const sidebarCollapsed = writable<boolean>(false)
export const sidebarWidth = writable<number>(220)     // file browser panel width, persisted
export const editorCollapsed = writable<boolean>(false)
export const previewCollapsed = writable<boolean>(false)

// Theme state
export const themes = writable<Theme[]>([])
export const activeThemeName = writable<string | null>(null) // active family
export const activeMode = writable<'light' | 'dark'>('dark')
// Mermaid base mode, derived from the active theme's mode.
export const activeMermaidMode = writable<'default' | 'dark'>('dark')

// In-document find (Ctrl/Cmd+F), scoped to the rendered Preview pane.
export const findOpen = writable<boolean>(false)
export const findQuery = writable<string>('')
export const findActiveIndex = writable<number>(0)
export const findMatchCount = writable<number>(0)
