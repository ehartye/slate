<script lang="ts">
  import {
    content, activeMermaidMode, previewZoom,
    currentFile, currentFolder, files, dirty, statusMsg,
  } from '$lib/stores'
  import { renderMarkdown } from '$lib/markdown'
  import { resolveMdLink, readFile, listMarkdownFiles, dirName } from '$lib/tauri'
  import { openUrl } from '@tauri-apps/plugin-opener'
  import mermaid from 'mermaid'
  import 'katex/dist/katex.min.css'
  // No hljs stylesheet import — code token colors come from the active theme's
  // --code-* CSS variables (mapped in base.css), so highlighting follows the theme.

  let container: HTMLDivElement
  let html = $state('')
  let timer: ReturnType<typeof setTimeout> | null = null

  mermaid.initialize({ startOnLoad: false })

  $effect(() => {
    const src = $content
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => { html = renderMarkdown(src) }, 120)
  })

  // After HTML updates, render any mermaid blocks.
  $effect(() => {
    void html
    if (!container) return
    const nodes = container.querySelectorAll<HTMLElement>('pre.mermaid')
    if (nodes.length === 0) return
    mermaid.initialize({ startOnLoad: false, theme: $activeMermaidMode })
    queueMicrotask(() => {
      mermaid.run({ nodes }).catch(() => { /* leave source visible on error */ })
    })
  })

  // Load a document into the app (shared shape with the sidebar's open).
  async function openDoc(path: string) {
    try {
      const text = await readFile(path)
      content.set(text)
      currentFile.set(path)
      dirty.set(false)
      const dir = dirName(path)
      if (dir && dir !== $currentFolder) {
        currentFolder.set(dir)
        try {
          files.set(await listMarkdownFiles(dir))
        } catch (e) {
          statusMsg.set(`Could not list folder: ${e}`)
        }
      }
    } catch (e) {
      statusMsg.set(`Could not open file: ${e}`)
    }
  }

  // Intercept link clicks in the rendered preview. Attached via addEventListener
  // (not an inline handler) so the non-interactive container stays a11y-clean;
  // this also catches keyboard-activated <a> elements (Enter → click).
  $effect(() => {
    if (!container) return
    container.addEventListener('click', onClick)
    return () => container.removeEventListener('click', onClick)
  })

  async function onClick(e: MouseEvent) {
    const a = (e.target as HTMLElement).closest('a')
    if (!a) return
    const raw = a.getAttribute('href')
    if (!raw) return

    // In-page anchors: leave default scroll behavior.
    if (raw.startsWith('#')) return

    // External links: open in the system browser, never in our webview.
    if (/^(https?:|mailto:|tel:)/i.test(raw)) {
      e.preventDefault()
      openUrl(raw).catch((err) => statusMsg.set(`Couldn't open link: ${err}`))
      return
    }

    // Relative path: we own navigation, so stop the webview from following it.
    e.preventDefault()
    const base = $currentFile
    if (!base) return
    const cleaned = decodeURIComponent(raw.replace(/[?#].*$/, ''))
    let resolved: string | null = null
    try {
      resolved = await resolveMdLink(base, cleaned)
    } catch (err) {
      statusMsg.set(`Couldn't open ${cleaned}: ${err}`)
      return
    }
    if (!resolved) {
      statusMsg.set(`Couldn't find ${cleaned}`)
      return
    }
    await openDoc(resolved)
  }
</script>

<div
  class="preview"
  bind:this={container}
  style="font-size: {$previewZoom * 16}px"
>
  {@html html}
</div>
