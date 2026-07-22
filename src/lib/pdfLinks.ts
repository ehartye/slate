// Pure logic for turning PDF link annotations into clickable, correctly-
// positioned overlays. Kept separate from PdfViewer.svelte (which owns
// pdf.js orchestration and DOM wiring) so this is unit testable, matching
// this codebase's convention of small pure-logic .ts modules backing
// components (pdfLayout.ts, zoom.ts, sidebarWidth.ts).

/** A link annotation's on-screen position, expressed as percentages of its
 *  page's own (scale-1) dimensions. Percentages (not absolute pixels) mean
 *  a link stays correctly positioned at any zoom level via plain CSS
 *  percentage positioning against the page container — no recomputation
 *  needed when the zoom changes, since the container itself already scales
 *  with zoom. */
export type LinkRect = { leftPct: number; topPct: number; widthPct: number; heightPct: number }

/** Convert a PDF-space annotation rect `[x1, y1, x2, y2]` into on-screen
 *  percentages of the page's own scale-1 dimensions. `convert` is typically
 *  a scale-1 `PageViewport`'s `convertToViewportPoint`, injected so this
 *  stays unit-testable without a real pdf.js viewport object — it already
 *  encodes the page's rotation and the PDF-vs-screen Y-flip, the same way
 *  the page's own canvas rendering does, so the overlay lines up exactly
 *  with the rendered content regardless of page orientation. */
export function annotationRectToPercent(
  rect: [number, number, number, number],
  convert: (x: number, y: number) => [number, number],
  pageWidth: number,
  pageHeight: number,
): LinkRect {
  const [x1, y1, x2, y2] = rect
  const [px1, py1] = convert(x1, y1)
  const [px2, py2] = convert(x2, y2)
  const left = Math.min(px1, px2)
  const top = Math.min(py1, py2)
  const width = Math.abs(px2 - px1)
  const height = Math.abs(py2 - py1)
  const safeW = pageWidth || 1
  const safeH = pageHeight || 1
  return {
    leftPct: (left / safeW) * 100,
    topPct: (top / safeH) * 100,
    widthPct: (width / safeW) * 100,
    heightPct: (height / safeH) * 100,
  }
}

/** The slice of PDFDocumentProxy that resolveDestinationPage needs —
 *  narrowed to an interface so this is unit-testable with a plain mock
 *  instead of a real (or fake) pdf.js document instance. */
export interface DestinationResolver {
  getDestination(id: string): Promise<unknown[] | null>
  getPageIndex(ref: object): Promise<number>
}

/** Resolve a link annotation's `dest` (either a named-destination string,
 *  or an already-explicit destination array) to a 1-based page number.
 *  Mirrors pdf.js's own PDFLinkService.goToDestination resolution
 *  algorithm (see pdfjs-dist/web/pdf_viewer.mjs) so internal PDF links
 *  behave the same way pdf.js's reference viewer would resolve them.
 *  Returns null if the destination can't be resolved to a valid page. */
export async function resolveDestinationPage(
  doc: DestinationResolver,
  dest: string | unknown[],
): Promise<number | null> {
  const explicitDest = typeof dest === 'string' ? await doc.getDestination(dest) : dest
  if (!Array.isArray(explicitDest)) return null
  const [destRef] = explicitDest
  if (destRef && typeof destRef === 'object') {
    try {
      return (await doc.getPageIndex(destRef as object)) + 1
    } catch {
      return null
    }
  }
  if (typeof destRef === 'number' && Number.isInteger(destRef)) return destRef + 1
  return null
}
