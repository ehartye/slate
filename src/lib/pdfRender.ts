// Serializes canvas paints for the PDF viewer: at most one pdf.js render task
// in flight per page, and a new one never starts until the previous has fully
// unwound. Kept out of PdfViewer.svelte (which owns the pdf.js/DOM
// orchestration) so this bookkeeping is unit testable, matching this
// codebase's convention of pure-logic .ts modules backing components
// (pdfLayout.ts, pdfLinks.ts, zoom.ts, ...).
//
// This exists because of a specific, very visible bug. Assigning
// `canvas.width`/`canvas.height` resets the 2D context to its defaults —
// including the transform pdf.js installed from the page viewport, whose
// y-flip is what makes a PDF (origin at the bottom-left, y increasing upward)
// draw right-side up at the right size. A paint still running when the canvas
// is resized for a *newer* paint carries on drawing into that reset context,
// so it lands in raw PDF coordinates: the page appears tiny and upside down
// until something (a scroll, a zoom) triggers a clean re-render.
//
// A "generation" counter can't fix this on its own — it stops a stale call
// from *starting* a paint, but does nothing about one already in flight. The
// only reliable fix is to cancel the running task and wait for it to actually
// stop before touching the canvas.

/** The part of pdf.js's `RenderTask` this needs, narrowed to an interface so
 *  tests can stand in a fake instead of constructing real pdf.js internals. */
export interface CancellableRender {
  promise: Promise<unknown>
  cancel(): void
}

/** pdf.js reports a cancelled paint by rejecting with a
 *  `RenderingCancelledException`. Matched by name rather than `instanceof` so
 *  this module doesn't have to import pdf.js (and tests don't have to
 *  construct one) just to recognize an expected outcome. */
export function isCancellation(e: unknown): boolean {
  return (
    !!e && typeof e === 'object' && (e as { name?: string }).name === 'RenderingCancelledException'
  )
}

/** Tracks the in-flight paint per page number. */
export class PageRenders {
  private inFlight = new Map<number, CancellableRender>()

  /** How many paints are currently in flight (for assertions/diagnostics). */
  get size(): number {
    return this.inFlight.size
  }

  isRendering(key: number): boolean {
    return this.inFlight.has(key)
  }

  /** Cancel `key`'s in-flight paint, if any, and resolve only once it has
   *  actually stopped — that guarantee is the whole point: callers rely on it
   *  to know the canvas is safe to resize. */
  async cancel(key: number): Promise<void> {
    const task = this.inFlight.get(key)
    if (!task) return
    task.cancel()
    try {
      await task.promise
    } catch {
      /* expected — cancelling is what rejected it */
    }
    // Guarded by identity: a newer paint may already have claimed this key
    // while the cancelled one was unwinding.
    if (this.inFlight.get(key) === task) this.inFlight.delete(key)
  }

  /** Cancel every in-flight paint — for a document swap or unmount. */
  async cancelAll(): Promise<void> {
    await Promise.all([...this.inFlight.keys()].map((key) => this.cancel(key)))
  }

  /** Record `task` as `key`'s in-flight paint and await it. A cancellation is
   *  swallowed (it's the normal outcome of `cancel` above, not a failure);
   *  any other error propagates so the caller can surface it. */
  async track(key: number, task: CancellableRender): Promise<void> {
    this.inFlight.set(key, task)
    try {
      await task.promise
    } catch (e) {
      if (!isCancellation(e)) throw e
    } finally {
      if (this.inFlight.get(key) === task) this.inFlight.delete(key)
    }
  }
}
