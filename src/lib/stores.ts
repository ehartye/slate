import { writable } from 'svelte/store'

export const currentFolder = writable<string | null>(null)
export const files = writable<string[]>([])          // full paths
export const currentFile = writable<string | null>(null)
export const content = writable<string>('')           // editor text
export const dirty = writable<boolean>(false)
export const statusMsg = writable<string>('')         // transient errors/info
export const editorScroll = writable<number>(0)       // 0..1 scroll fraction, for preview sync

// Mermaid base mode, set by the active theme (added to in Task 7).
export const activeMermaidMode = writable<'default' | 'dark'>('dark')
