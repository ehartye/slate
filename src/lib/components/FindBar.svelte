<script lang="ts">
  import { findOpen, findQuery, findActiveIndex, findMatchCount } from '$lib/stores'

  let inputEl = $state<HTMLInputElement>()

  // Autofocus (and select any previous query) whenever the bar opens.
  $effect(() => {
    if ($findOpen && inputEl) {
      inputEl.focus()
      inputEl.select()
    }
  })

  function next() {
    if ($findMatchCount === 0) return
    findActiveIndex.set(($findActiveIndex + 1) % $findMatchCount)
  }

  function prev() {
    if ($findMatchCount === 0) return
    findActiveIndex.set(($findActiveIndex - 1 + $findMatchCount) % $findMatchCount)
  }

  function close() {
    findOpen.set(false)
  }

  function onKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      e.preventDefault()
      close()
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (e.shiftKey) prev()
      else next()
    }
  }
</script>

{#if $findOpen}
  <div class="find-bar">
    <input
      bind:this={inputEl}
      bind:value={$findQuery}
      onkeydown={onKeydown}
      type="text"
      placeholder="Find in document…"
      aria-label="Find in document"
    />
    <span class="find-count">{$findMatchCount ? $findActiveIndex + 1 : 0}/{$findMatchCount}</span>
    <button class="find-nav" onclick={prev} disabled={$findMatchCount === 0} title="Previous match (Shift+Enter)">↑</button>
    <button class="find-nav" onclick={next} disabled={$findMatchCount === 0} title="Next match (Enter)">↓</button>
    <button class="find-close" onclick={close} title="Close (Esc)">×</button>
  </div>
{/if}
