// Pure zoom/layout math for the PDF viewer's continuous-scroll page list and
// its "fit width" / "fit page" zoom modes. Kept separate from
// PdfViewer.svelte (which owns pdf.js orchestration, canvas rendering, and
// IntersectionObserver/ResizeObserver wiring) so this arithmetic is unit
// testable, matching this codebase's convention of pure-logic .ts modules
// backing components (zoom.ts, sidebarWidth.ts, fileKind.ts, etc).

export const PDF_ZOOM_MIN = 0.25
export const PDF_ZOOM_MAX = 3

/** Clamp a zoom factor to the viewer's supported range. */
export function clampZoom(zoom: number): number {
  return Math.min(PDF_ZOOM_MAX, Math.max(PDF_ZOOM_MIN, zoom))
}

/** Scale that makes a `pageWidth`-wide (at scale 1) page exactly fill
 *  `containerWidth`, clamped to the supported zoom range. Falls back to 1
 *  for degenerate (zero/negative) input, e.g. before layout has settled. */
export function fitWidthScale(containerWidth: number, pageWidth: number): number {
  if (pageWidth <= 0 || containerWidth <= 0) return 1
  return clampZoom(containerWidth / pageWidth)
}

/** Scale that makes a `pageWidth` x `pageHeight` page (at scale 1) fit
 *  entirely within `containerWidth` x `containerHeight` — whichever
 *  dimension is the tighter constraint — clamped to the supported zoom
 *  range. Falls back to 1 for degenerate (zero/negative) input. */
export function fitPageScale(
  containerWidth: number,
  containerHeight: number,
  pageWidth: number,
  pageHeight: number,
): number {
  if (pageWidth <= 0 || pageHeight <= 0 || containerWidth <= 0 || containerHeight <= 0) return 1
  return clampZoom(Math.min(containerWidth / pageWidth, containerHeight / pageHeight))
}

/** Which page (1-based) should be considered "current" for the page
 *  indicator/prev-next buttons, given each page's visible intersection
 *  ratio (from an IntersectionObserver) keyed by page number. Picks the
 *  page with the highest visible ratio; ties go to the earlier
 *  (lower-numbered) page. Falls back to 1 if nothing is visible yet (e.g.
 *  before layout/observers have settled). */
export function currentPageFromVisibility(ratios: Map<number, number>): number {
  let best = 1
  let bestRatio = 0
  for (const [page, ratio] of [...ratios.entries()].sort((a, b) => a[0] - b[0])) {
    if (ratio > bestRatio) {
      bestRatio = ratio
      best = page
    }
  }
  return best
}
