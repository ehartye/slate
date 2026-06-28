// Preview zoom level, persisted across launches (like the theme choice).
import { get } from 'svelte/store'
import { previewZoom } from './stores'

export const ZOOM_MIN = 0.5
export const ZOOM_MAX = 3.0
export const ZOOM_STEP = 0.1

const SAVED_KEY = 'slate.zoom'

/** Clamp to [ZOOM_MIN, ZOOM_MAX] and round to one step, avoiding float drift. */
export function clampZoom(z: number): number {
  const stepped = Math.round(z / ZOOM_STEP) * ZOOM_STEP
  const clamped = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, stepped))
  return Math.round(clamped * 100) / 100
}

/** The remembered zoom level, clamped; 1 if none/unreadable. */
export function loadZoom(): number {
  try {
    const raw = localStorage.getItem(SAVED_KEY)
    if (raw == null) return 1
    const n = Number(raw)
    return Number.isFinite(n) ? clampZoom(n) : 1
  } catch {
    return 1
  }
}

export function saveZoom(z: number): void {
  try {
    localStorage.setItem(SAVED_KEY, String(z))
  } catch {
    /* localStorage unavailable — non-fatal */
  }
}

/** Set the preview zoom to an absolute level (clamped) and remember it. */
export function setZoom(z: number): void {
  const clamped = clampZoom(z)
  previewZoom.set(clamped)
  saveZoom(clamped)
}

/** Nudge the current zoom by ±ZOOM_STEP. */
export function nudgeZoom(direction: 1 | -1): void {
  setZoom(get(previewZoom) + direction * ZOOM_STEP)
}
