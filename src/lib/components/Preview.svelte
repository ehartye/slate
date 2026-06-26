<script lang="ts">
  import { content } from '$lib/stores'
  import { renderMarkdown } from '$lib/markdown'

  let html = $state('')
  let timer: ReturnType<typeof setTimeout> | null = null

  $effect(() => {
    const src = $content
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => { html = renderMarkdown(src) }, 120)
  })
</script>

<div class="preview">
  {@html html}
</div>
