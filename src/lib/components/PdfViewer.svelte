<script lang="ts">
  import { onMount, onDestroy, tick } from 'svelte'
  import { pdfDataUrl } from '$lib/stores'
  import {
    fitWidthScale,
    fitPageScale,
    clampZoom,
    currentPageFromVisibility,
  } from '$lib/pdfLayout'
  import type { PDFDocumentProxy, PDFDocumentLoadingTask } from 'pdfjs-dist'

  type FitMode = 'width' | 'page' | 'custom'
  type PageEntry = {
    num: number
    width: number // at scale 1, in PDF points
    height: number // at scale 1, in PDF points
    rendered: boolean
    renderGen: number // per-page staleness guard — see renderPage
  }

  // Horizontal padding .pdf-page-area applies in base.css — kept in sync
  // with that value so "fit width" leaves the same breathing room on both
  // sides instead of computing a scale that would need side-scrolling.
  const AREA_PADDING_X = 18

  let scrollEl = $state<HTMLDivElement>()
  let pages = $state<PageEntry[]>([])
  let numPages = $state(0)
  let zoom = $state(1)
  let fitMode = $state<FitMode>('width')
  let currentPageNum = $state(1)
  let loading = $state(false)
  let errorMsg = $state('')

  let pdfjsLib: typeof import('pdfjs-dist') | null = null
  // $state.raw, not $state: we only ever reassign this wholesale (never
  // mutate it in place), and deep-proxying a pdf.js class instance would
  // risk breaking its internal method/field access. Also lets renderPage
  // compare `pdfDoc !== doc` by identity — a $state proxy would never equal
  // the raw object `task.promise` resolves to.
  let pdfDoc = $state.raw<PDFDocumentProxy | null>(null)
  // `destroy()` lives on the loading task returned by getDocument(), not on
  // the PDFDocumentProxy it resolves to — keep it around to release the
  // worker/cached resources when replaced or the component unmounts.
  let loadingTask: PDFDocumentLoadingTask | null = null
  let renderToken = 0 // bumped per doc load; guards stale async work from a superseded document

  // Canvas elements, keyed by page number. Deliberately NOT part of the
  // reactive `pages` array/state — plain DOM refs, populated/cleared by the
  // bindCanvas action as page containers mount/unmount (e.g. on doc reload).
  const canvasRefs = new Map<number, HTMLCanvasElement>()
  // Each page container's visible fraction, from the shared IntersectionObserver
  // below — feeds currentPageFromVisibility() to drive the page indicator.
  const visibleRatios = new Map<number, number>()
  let pageObserver: IntersectionObserver | null = null
  let resizeObserver: ResizeObserver | null = null

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

  /** Render (or re-render) one page's canvas at the current zoom — called
   *  when a page first scrolls into view, and again for every
   *  already-rendered page whenever the zoom changes. `renderGen` guards
   *  against rapid successive calls for the *same* page (e.g. someone
   *  mashing zoom in/out): only the most recently-started call for a given
   *  page is allowed to actually touch its canvas, so an older, slower call
   *  can't clobber it after a newer one already finished. */
  async function renderPage(entry: PageEntry) {
    const doc = pdfDoc
    const canvas = canvasRefs.get(entry.num)
    if (!doc || !canvas) return
    const docToken = renderToken
    entry.renderGen += 1
    const gen = entry.renderGen
    const page = await doc.getPage(entry.num)
    if (docToken !== renderToken || pdfDoc !== doc || gen !== entry.renderGen) return
    const dpr = window.devicePixelRatio || 1
    const viewport = page.getViewport({ scale: zoom * dpr })
    canvas.width = viewport.width
    canvas.height = viewport.height
    await page.render({ canvas, viewport }).promise
  }

  function rerenderAllRendered() {
    for (const entry of pages) {
      if (entry.rendered) void renderPage(entry)
    }
  }

  /** Recompute `zoom` from the current fit mode against the scroll
   *  container's available size, using the first page as the reference
   *  (PDFs may mix page sizes, but nearly always don't — a single shared
   *  zoom per the whole continuous-scroll list is standard PDF-reader UX).
   *  No-op in 'custom' mode (the user picked a specific zoom manually). */
  function applyFitMode() {
    if (fitMode === 'custom' || !scrollEl || pages.length === 0) return
    const ref = pages[0]
    const availW = scrollEl.clientWidth - AREA_PADDING_X * 2
    const availH = scrollEl.clientHeight
    zoom =
      fitMode === 'width'
        ? fitWidthScale(availW, ref.width)
        : fitPageScale(availW, availH, ref.width, ref.height)
    rerenderAllRendered()
  }

  async function loadDoc(dataUrl: string) {
    renderToken += 1
    const token = renderToken
    loading = true
    errorMsg = ''
    loadingTask?.destroy()
    pdfDoc = null
    pages = []
    numPages = 0
    visibleRatios.clear()
    currentPageNum = 1
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
      // Fetch every page's scale-1 dimensions upfront so the continuous
      // scroll list can be laid out (and scrollbar-sized) correctly right
      // away — getPage() just parses a page's dictionary, not its content
      // stream, so this is cheap even for a document of a few hundred pages.
      // Actual pixel rendering stays lazy (triggered by the
      // IntersectionObserver below as each page scrolls into view).
      const entries: PageEntry[] = []
      for (let n = 1; n <= doc.numPages; n++) {
        const page = await doc.getPage(n)
        if (token !== renderToken) return // a newer load superseded this one mid-fetch
        const vp = page.getViewport({ scale: 1 })
        entries.push({ num: n, width: vp.width, height: vp.height, rendered: false, renderGen: 0 })
      }
      if (token !== renderToken) return
      pdfDoc = doc
      numPages = doc.numPages
      pages = entries
      await tick() // let the DOM lay out the now correctly-sized page containers
      applyFitMode()
    } catch (e) {
      if (token === renderToken) errorMsg = `Could not load PDF: ${e}`
    } finally {
      if (token === renderToken) loading = false
    }
  }

  $effect(() => {
    const url = $pdfDataUrl
    if (url) void loadDoc(url)
  })

  function onIntersect(observed: IntersectionObserverEntry[]) {
    for (const e of observed) {
      const num = Number((e.target as HTMLElement).dataset.page)
      if (!num) continue
      visibleRatios.set(num, e.isIntersecting ? e.intersectionRatio : 0)
      if (e.isIntersecting) {
        const entry = pages.find((p) => p.num === num)
        if (entry && !entry.rendered) {
          entry.rendered = true
          void renderPage(entry)
        }
      }
    }
    currentPageNum = currentPageFromVisibility(visibleRatios)
  }

  /** Action: registers a page container with the shared
   *  IntersectionObserver, tagging it with its page number (read back in
   *  onIntersect via the dataset) so lazy-rendering and the "current page"
   *  indicator both know which page an intersection event is about. */
  function observePage(node: HTMLElement, pageNum: number) {
    node.dataset.page = String(pageNum)
    pageObserver?.observe(node)
    return {
      destroy() {
        pageObserver?.unobserve(node)
      },
    }
  }

  /** Action: tracks a page's canvas element in canvasRefs while it's
   *  mounted — see canvasRefs' declaration for why this is a plain Map
   *  rather than a field on the (reactive) PageEntry. */
  function bindCanvas(node: HTMLCanvasElement, pageNum: number) {
    canvasRefs.set(pageNum, node)
    return {
      destroy() {
        if (canvasRefs.get(pageNum) === node) canvasRefs.delete(pageNum)
      },
    }
  }

  function scrollToPage(n: number) {
    scrollEl?.querySelector<HTMLElement>(`[data-page="${n}"]`)?.scrollIntoView({ block: 'start' })
  }
  function prevPage() {
    scrollToPage(Math.max(1, currentPageNum - 1))
  }
  function nextPage() {
    scrollToPage(Math.min(numPages, currentPageNum + 1))
  }

  function setFitWidth() {
    fitMode = 'width'
    applyFitMode()
  }
  function setFitPage() {
    fitMode = 'page'
    applyFitMode()
  }
  function setActualSize() {
    fitMode = 'custom'
    zoom = 1
    rerenderAllRendered()
  }
  function zoomOut() {
    fitMode = 'custom'
    zoom = clampZoom(Math.round((zoom - 0.25) * 100) / 100)
    rerenderAllRendered()
  }
  function zoomIn() {
    fitMode = 'custom'
    zoom = clampZoom(Math.round((zoom + 0.25) * 100) / 100)
    rerenderAllRendered()
  }

  onMount(() => {
    if (scrollEl) {
      pageObserver = new IntersectionObserver(onIntersect, {
        root: scrollEl,
        rootMargin: '75% 0px', // pre-render up to ~3/4 screen ahead/behind for smooth scrolling
        threshold: [0, 0.25, 0.5, 0.75, 1],
      })
      resizeObserver = new ResizeObserver(() => applyFitMode())
      resizeObserver.observe(scrollEl)
    }
    return () => {
      pageObserver?.disconnect()
      resizeObserver?.disconnect()
    }
  })

  onDestroy(() => {
    loadingTask?.destroy()
  })
</script>

<div class="pdf-viewer">
  <div class="pdf-toolbar">
    <span class="pdf-pagenav">
      <button class="pdf-btn" onclick={prevPage} disabled={currentPageNum <= 1} aria-label="Previous page">‹</button>
      <span class="pdf-page-indicator">{numPages ? `${currentPageNum} / ${numPages}` : '—'}</span>
      <button class="pdf-btn" onclick={nextPage} disabled={currentPageNum >= numPages} aria-label="Next page">›</button>
    </span>
    <span class="pdf-fit">
      <button class="pdf-btn" class:active={fitMode === 'width'} onclick={setFitWidth} title="Fit page width to the window">Width</button>
      <button class="pdf-btn" class:active={fitMode === 'page'} onclick={setFitPage} title="Fit whole page in the window">Page</button>
    </span>
    <span class="pdf-zoom">
      <button class="pdf-btn" onclick={zoomOut} aria-label="Zoom out">−</button>
      <button class="pdf-btn pdf-zoom-level" onclick={setActualSize} title="Actual size (100%)">{Math.round(zoom * 100)}%</button>
      <button class="pdf-btn" onclick={zoomIn} aria-label="Zoom in">+</button>
    </span>
  </div>
  <div class="pdf-page-area" bind:this={scrollEl}>
    {#if errorMsg}
      <div class="pdf-error">{errorMsg}</div>
    {:else if loading}
      <div class="pdf-status">Loading PDF…</div>
    {:else}
      {#each pages as entry (entry.num)}
        <div
          class="pdf-page-container"
          use:observePage={entry.num}
          style="width:{entry.width * zoom}px; height:{entry.height * zoom}px"
        >
          <canvas use:bindCanvas={entry.num}></canvas>
        </div>
      {/each}
    {/if}
  </div>
</div>
