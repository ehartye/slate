/** Zoom arithmetic for ImageViewer.
 *
 *  Split out for the same reason as pdfLayout/pdfLinks: it is the only part of
 *  the viewer with logic worth pinning, and it is testable without a DOM or a
 *  decoded image.
 *
 *  Zoom is either a number (an explicit scale, 1 = actual pixels) or `null`,
 *  meaning "fit the window" — a layout mode whose effective scale depends on
 *  the container and so isn't known here. */

export const MIN_ZOOM = 0.1
export const MAX_ZOOM = 8
/** One step. Multiplicative so in/out are exact inverses. */
const STEP = 1.25

export function clampZoom(zoom: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom))
}

/** The first explicit step out of fit mode starts from actual size — the
 *  fitted scale isn't a number this module can see. */
const from = (zoom: number | null) => zoom ?? 1

export function zoomIn(zoom: number | null): number {
  return clampZoom(from(zoom) * STEP)
}

export function zoomOut(zoom: number | null): number {
  return clampZoom(from(zoom) / STEP)
}
