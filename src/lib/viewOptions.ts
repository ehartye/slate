// File-browser view filters (Markdown-only mode, hidden files), persisted
// across launches (like zoom.ts / sidebarWidth.ts).
import { mdOnlyMode, showHiddenFiles } from './stores'

const MD_ONLY_KEY = 'slate.mdOnlyMode'
const SHOW_HIDDEN_KEY = 'slate.showHiddenFiles'

function loadBool(key: string, fallback: boolean): boolean {
  try {
    const raw = localStorage.getItem(key)
    return raw == null ? fallback : raw === 'true'
  } catch {
    return fallback
  }
}

function saveBool(key: string, value: boolean): void {
  try {
    localStorage.setItem(key, String(value))
  } catch {
    /* localStorage unavailable — non-fatal */
  }
}

/** The remembered "Markdown only" setting; true (the historical default) if none/unreadable. */
export const loadMdOnlyMode = () => loadBool(MD_ONLY_KEY, true)

/** Set "Markdown only" mode and remember the choice. */
export function setMdOnlyMode(value: boolean): void {
  mdOnlyMode.set(value)
  saveBool(MD_ONLY_KEY, value)
}

/** The remembered "show hidden files" setting; false if none/unreadable. */
export const loadShowHiddenFiles = () => loadBool(SHOW_HIDDEN_KEY, false)

/** Set "show hidden files" and remember the choice. */
export function setShowHiddenFiles(value: boolean): void {
  showHiddenFiles.set(value)
  saveBool(SHOW_HIDDEN_KEY, value)
}
