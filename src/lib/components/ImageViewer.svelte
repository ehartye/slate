<script lang="ts">
  /** Image tabs. The image counterpart of PdfViewer.svelte, and deliberately
   *  much smaller: the webview already decodes and paints an image given a
   *  `data:` URL, so there is no render pipeline to drive — only framing.
   *
   *  Content arrives through the `imageDataUrl` store, which like `content`
   *  and `pdfDataUrl` is a view of the active tab's entry in `tabDocs`, so a
   *  tab switch cannot leave this showing the previous tab's image. */
  import { imageDataUrl, currentFile } from '$lib/stores'
  import { MIN_ZOOM, MAX_ZOOM, zoomIn, zoomOut, clampZoom } from '$lib/imageZoom'

  /** null = fit to window; a number = explicit scale, 1 being actual pixels. */
  let zoom = $state<number | null>(null)
  let natural = $state<{ w: number; h: number } | null>(null)
  let failed = $state(false)

  // A new image is a new framing problem: an explicit zoom chosen for the last
  // one says nothing about this one, so every tab starts fitted.
  $effect(() => {
    void $imageDataUrl
    zoom = null
    natural = null
    failed = false
  })

  function onLoad(e: Event) {
    const img = e.currentTarget as HTMLImageElement
    // An SVG with no intrinsic size reports 0; treat that as "no natural size
    // to report" rather than showing 0 × 0.
    natural = img.naturalWidth > 0 ? { w: img.naturalWidth, h: img.naturalHeight } : null
    failed = false
  }

  const fit = () => (zoom = null)
  const actualSize = () => (zoom = 1)
  const stepIn = () => (zoom = zoomIn(zoom))
  const stepOut = () => (zoom = zoomOut(zoom))

  let zoomLabel = $derived(zoom === null ? 'Fit' : `${Math.round(zoom * 100)}%`)
  // In fit mode the browser does the scaling via CSS; an explicit zoom sets a
  // pixel width off the natural size so the scale means what it says.
  let explicitWidth = $derived(
    zoom !== null && natural ? `${Math.round(natural.w * clampZoom(zoom))}px` : null,
  )
</script>

<div class="img-viewer">
  <div class="img-toolbar">
    <div class="img-toolbar-group">
      <span class="img-fit">
        <button
          class="img-btn"
          class:active={zoom === null}
          onclick={fit}
          title="Fit image in the window"
          aria-label="Fit image in the window">Fit</button>
        <button
          class="img-btn"
          class:active={zoom === 1}
          onclick={actualSize}
          title="Actual size"
          aria-label="Show the image at actual size">1:1</button>
      </span>
    </div>
    <div class="img-toolbar-group">
      {#if natural}
        <span class="img-dims">{natural.w} × {natural.h}</span>
      {/if}
      <span class="img-zoom">
        <button
          class="img-btn"
          onclick={stepOut}
          disabled={zoom !== null && zoom <= MIN_ZOOM}
          aria-label="Zoom out">−</button>
        <span class="img-btn img-zoom-level">{zoomLabel}</span>
        <button
          class="img-btn"
          onclick={stepIn}
          disabled={zoom !== null && zoom >= MAX_ZOOM}
          aria-label="Zoom in">+</button>
      </span>
    </div>
  </div>

  <div class="img-body" class:fitted={zoom === null}>
    {#if failed}
      <p class="img-error">Could not display this image — it may be corrupt or an unsupported variant.</p>
    {:else if $imageDataUrl}
      <img
        class="img-canvas"
        src={$imageDataUrl}
        alt={$currentFile ?? 'image'}
        style={explicitWidth ? `width: ${explicitWidth}; max-width: none; max-height: none;` : ''}
        onload={onLoad}
        onerror={() => (failed = true)} />
    {:else}
      <p class="img-status">Loading…</p>
    {/if}
  </div>
</div>
