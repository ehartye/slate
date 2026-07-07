// Sidebar (file browser) panel width, persisted across launches (like zoom.ts).
import { get } from 'svelte/store'
import { sidebarWidth } from './stores'

export const SIDEBAR_MIN = 160
export const SIDEBAR_MAX = 480
const DEFAULT_WIDTH = 220

const SAVED_KEY = 'slate.sidebarWidth'

/** Clamp to [SIDEBAR_MIN, SIDEBAR_MAX], rounded to a whole pixel. */
export function clampSidebarWidth(w: number): number {
  return Math.round(Math.min(SIDEBAR_MAX, Math.max(SIDEBAR_MIN, w)))
}

/** The remembered sidebar width, clamped; the default if none/unreadable. */
export function loadSidebarWidth(): number {
  try {
    const raw = localStorage.getItem(SAVED_KEY)
    if (raw == null) return DEFAULT_WIDTH
    const n = Number(raw)
    return Number.isFinite(n) ? clampSidebarWidth(n) : DEFAULT_WIDTH
  } catch {
    return DEFAULT_WIDTH
  }
}

export function saveSidebarWidth(w: number): void {
  try {
    localStorage.setItem(SAVED_KEY, String(w))
  } catch {
    /* localStorage unavailable — non-fatal */
  }
}

/** Persist whatever width is currently in the store (call after a drag ends). */
export function persistSidebarWidth(): void {
  saveSidebarWidth(get(sidebarWidth))
}
