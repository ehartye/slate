<script lang="ts">
  import { onMount } from 'svelte'
  import { invoke } from '@tauri-apps/api/core'
  import { currentFile, currentFolder, content, themes, activeThemeName, activeMermaidMode } from '$lib/stores'
  import { baseName } from '$lib/tauri'
  import { listThemes, applyTheme, type Theme } from '$lib/theme'
  import { renderMarkdown } from '$lib/markdown'
  import { buildStandaloneHtml } from '$lib/export'

  function select(t: Theme) {
    applyTheme(t.css)
    activeThemeName.set(t.name)
    activeMermaidMode.set(t.mermaid)
  }

  async function openInBrowser() {
    const theme = $themes.find((t) => t.name === $activeThemeName)
    const html = buildStandaloneHtml(
      renderMarkdown($content),
      theme?.css ?? '',
      $currentFile ? baseName($currentFile) : 'Slate',
    )
    await invoke('open_in_browser', { html })
  }

  onMount(async () => {
    const loaded = await listThemes()
    themes.set(loaded)
    if (loaded.length > 0) select(loaded.find((t) => t.name === 'Midnight') ?? loaded[0])
  })

  function onChange(e: Event) {
    const name = (e.target as HTMLSelectElement).value
    const t = $themes.find((x) => x.name === name)
    if (t) select(t)
  }
</script>

<header class="toolbar">
  <strong>{$currentFile ? baseName($currentFile) : 'Slate'}</strong>
  {#if $currentFolder}<span class="muted">— {$currentFolder}</span>{/if}
  <span class="spacer"></span>
  <button class="browser-btn" onclick={openInBrowser}>Open in browser ↗</button>
  <label class="theme-label">Theme
    <select onchange={onChange} value={$activeThemeName ?? ''}>
      {#each $themes as t (t.name)}<option value={t.name}>{t.name}</option>{/each}
    </select>
  </label>
</header>
