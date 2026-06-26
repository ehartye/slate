<script lang="ts">
  import { content, activeMermaidMode } from '$lib/stores'
  import { renderMarkdown } from '$lib/markdown'
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
</script>

<div class="preview" bind:this={container}>
  {@html html}
</div>
