<script lang="ts">
  import { onMount } from 'svelte'
  import { currentFile, currentFolder, themes, activeThemeName, activeMermaidMode } from '$lib/stores'
  import { baseName } from '$lib/tauri'
  import { listThemes, applyTheme, type Theme } from '$lib/theme'

  function select(t: Theme) {
    applyTheme(t.css)
    activeThemeName.set(t.name)
    activeMermaidMode.set(t.mermaid)
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
  <label class="theme-label">Theme
    <select onchange={onChange} value={$activeThemeName ?? ''}>
      {#each $themes as t (t.name)}<option value={t.name}>{t.name}</option>{/each}
    </select>
  </label>
</header>
