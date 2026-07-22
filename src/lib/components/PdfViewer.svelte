<script lang="ts">
  import { onDestroy } from 'svelte'
  import { pdfDataUrl } from '$lib/stores'
  import type { PDFDocumentProxy, PDFDocumentLoadingTask } from 'pdfjs-dist'

  let canvas = $state<HTMLCanvasElement>()
  let pageNum = $state(1)
  let numPages = $state(0)
  let zoom = $state(1)
  let loading = $state(false)
  let errorMsg = $state('')

  let pdfjsLib: typeof import('pdfjs-dist') | null = null
  // $state.raw, not $state: we only ever reassign this wholesale (never
  // mutate it in place), and deep-proxying a pdf.js class instance would
  // risk breaking its internal method/field access. Needs to be reactive
  // (not a plain `let`) so the render $effect below actually re-fires once
  // a doc finishes loading — see the bug this fixed in loadDoc's comment.
  let pdfDoc = $state.raw<PDFDocumentProxy | null>(null)
  // `destroy()` lives on the loading task returned by getDocument(), not on
  // the PDFDocumentProxy it resolves to — keep it around to release the
  // worker/cached resources when replaced or the component unmounts.
  let loadingTask: PDFDocumentLoadingTask | null = null
  let renderToken = 0 // guards against a stale render finishing after a newer one started

  /** pdf.js needs a worker script; dynamically imported (and only wired up
   *  once) so its ~470KB isn't paid until a PDF tab is actually opened
   *  (confirmed via a real build: Vite code-splits it into its own chunk,
   *  loaded only when this function runs — see CLAUDE.md's PDF section). */
  async function ensurePdfjs() {
    if (pdfjsLib) return pdfjsLib
    const lib = await import('pdfjs-dist')
    lib.GlobalWorkerOptions.workerSrc = new URL(
      'pdfjs-dist/build/pdf.worker.min.mjs',
      import.meta.url,
    ).toString()
    pdfjsLib = lib
    return lib
  }

  /** Decode a `data:application/pdf;base64,...` URL into raw bytes. pdf.js's
   *  own docs say to pass base64 data through `atob()` first and hand it a
   *  Uint8Array via `data`, not a `data:` URL via `url` — `url` is meant for
   *  a fetchable network location, and pdf.js's networking/range-request
   *  layer doesn't handle a giant `data:` URL as one, surfacing (rather than
   *  rendering) something resembling the raw payload instead. */
  function dataUrlToBytes(dataUrl: string): Uint8Array {
    const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1)
    const binary = atob(base64)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
    return bytes
  }

  async function renderPage() {
    if (!pdfDoc || !canvas) return
    const token = renderToken
    const page = await pdfDoc.getPage(pageNum)
    const dpr = window.devicePixelRatio || 1
    const viewport = page.getViewport({ scale: zoom * dpr })
    if (token !== renderToken || !canvas) return // superseded by a newer page/zoom/doc change
    canvas.width = viewport.width
    canvas.height = viewport.height
    canvas.style.width = `${viewport.width / dpr}px`
    canvas.style.height = `${viewport.height / dpr}px`
    await page.render({ canvas, viewport }).promise
  }

  async function loadDoc(dataUrl: string) {
    renderToken += 1
    const token = renderToken
    loading = true
    errorMsg = ''
    loadingTask?.destroy()
    pdfDoc = null
    try {
      const lib = await ensurePdfjs()
      const task = lib.getDocument({ data: dataUrlToBytes(dataUrl) })
      loadingTask = task
      const doc = await task.promise
      if (token !== renderToken) {
        // A newer load started (e.g. rapid tab switching) — this one lost.
        task.destroy()
        return
      }
      // Rendering happens in the `$effect` below, triggered by `pdfDoc`
      // changing — not here. The <canvas> doesn't exist in the DOM yet at
      // this point (`loading` is still true, so the template shows "Loading
      // PDF…" instead of the canvas), so calling renderPage() here directly
      // would just bail immediately on a null canvas ref. This used to be a
      // real bug: pdfDoc was a plain (non-reactive) variable, so nothing
      // ever retried the render once the canvas (re)appeared after `loading`
      // flipped back to false.
      pdfDoc = doc
      numPages = doc.numPages
      pageNum = 1
    } catch (e) {
      if (token === renderToken) errorMsg = `Could not render PDF: ${e}`
    } finally {
      if (token === renderToken) loading = false
    }
  }

  $effect(() => {
    const url = $pdfDataUrl
    if (url) void loadDoc(url)
  })

  $effect(() => {
    void pageNum
    void zoom
    if (pdfDoc) void renderPage()
  })

  onDestroy(() => {
    loadingTask?.destroy()
  })

  function prevPage() {
    if (pageNum > 1) pageNum -= 1
  }
  function nextPage() {
    if (pageNum < numPages) pageNum += 1
  }
  const ZOOM_MIN = 0.25
  const ZOOM_MAX = 3
  function zoomOut() {
    zoom = Math.max(ZOOM_MIN, Math.round((zoom - 0.25) * 100) / 100)
  }
  function zoomIn() {
    zoom = Math.min(ZOOM_MAX, Math.round((zoom + 0.25) * 100) / 100)
  }
  function zoomReset() {
    zoom = 1
  }
</script>

<div class="pdf-viewer">
  <div class="pdf-toolbar">
    <span class="pdf-pagenav">
      <button class="pdf-btn" onclick={prevPage} disabled={pageNum <= 1} aria-label="Previous page">‹</button>
      <span class="pdf-page-indicator">{numPages ? `${pageNum} / ${numPages}` : '—'}</span>
      <button class="pdf-btn" onclick={nextPage} disabled={pageNum >= numPages} aria-label="Next page">›</button>
    </span>
    <span class="pdf-zoom">
      <button class="pdf-btn" onclick={zoomOut} aria-label="Zoom out">−</button>
      <button class="pdf-btn pdf-zoom-level" onclick={zoomReset} title="Reset to 100%">{Math.round(zoom * 100)}%</button>
      <button class="pdf-btn" onclick={zoomIn} aria-label="Zoom in">+</button>
    </span>
  </div>
  <div class="pdf-page-area">
    {#if errorMsg}
      <div class="pdf-error">{errorMsg}</div>
    {:else if loading}
      <div class="pdf-status">Loading PDF…</div>
    {:else}
      <canvas bind:this={canvas}></canvas>
    {/if}
  </div>
</div>
