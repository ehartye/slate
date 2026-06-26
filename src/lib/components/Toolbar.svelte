<script lang="ts">
  import { onMount } from 'svelte'
  import { invoke } from '@tauri-apps/api/core'
  import {
    currentFile, currentFolder, content, dirty,
    themes, activeThemeName, activeMode, activeMermaidMode,
    sidebarCollapsed,
  } from '$lib/stores'
  import { baseName } from '$lib/tauri'
  import { listThemes, applyTheme, type Theme } from '$lib/theme'
  import { renderMarkdown } from '$lib/markdown'
  import { buildStandaloneHtml } from '$lib/export'

  function uniqueFamilies(list: Theme[]): string[] {
    const seen = new Set<string>()
    const out: string[] = []
    for (const t of list) if (!seen.has(t.name)) { seen.add(t.name); out.push(t.name) }
    return out
  }

  let families = $derived(uniqueFamilies($themes))

  function variant(family: string, mode: 'light' | 'dark'): Theme | undefined {
    return $themes.find((t) => t.name === family && t.mode === mode)
  }

  function apply(t: Theme) {
    applyTheme(t.css)
    activeThemeName.set(t.name)
    activeMode.set(t.mode)
    activeMermaidMode.set(t.mermaid)
  }

  function selectFamily(family: string) {
    const t = variant(family, $activeMode) ?? $themes.find((x) => x.name === family)
    if (t) apply(t)
  }

  function setMode(mode: 'light' | 'dark') {
    const t = variant($activeThemeName ?? '', mode) ?? $themes.find((x) => x.mode === mode)
    if (t) apply(t)
  }

  onMount(async () => {
    const loaded = await listThemes()
    themes.set(loaded)
    const def = loaded.find((t) => t.name === 'Aurora' && t.mode === 'dark') ?? loaded[0]
    if (def) apply(def)
  })

  async function openInBrowser() {
    const theme = $themes.find((t) => t.name === $activeThemeName && t.mode === $activeMode)
    const html = buildStandaloneHtml(
      renderMarkdown($content),
      theme?.css ?? '',
      $currentFile ? baseName($currentFile) : 'Slate',
    )
    await invoke('open_in_browser', { html })
  }
</script>

<header class="toolbar">
  <button
    class="icon-btn sidebar-toggle"
    class:off={$sidebarCollapsed}
    onclick={() => sidebarCollapsed.update((v) => !v)}
    title={$sidebarCollapsed ? 'Show file browser' : 'Hide file browser'}
    aria-label="Toggle file browser"
  >▐</button>
  <span class="brand"><span class="brand-dot"></span>Slate</span>
  {#if $currentFile}
    <span class="file">{baseName($currentFile)}{#if $dirty}<span class="file-dot" title="Unsaved"></span>{/if}</span>
  {/if}
  {#if $currentFolder}<span class="muted">{$currentFolder}</span>{/if}

  <span class="spacer"></span>

  <button class="browser-btn" onclick={openInBrowser} title="Open the rendered document in your browser">
    Open in browser <span class="arrow">↗</span>
  </button>

  <div class="theme-picker">
    <div class="mode-toggle" role="group" aria-label="Light or dark mode">
      <button class="mode-btn" class:active={$activeMode === 'light'} onclick={() => setMode('light')} title="Light" aria-label="Light mode">☀</button>
      <button class="mode-btn" class:active={$activeMode === 'dark'} onclick={() => setMode('dark')} title="Dark" aria-label="Dark mode">☾</button>
    </div>
    <div class="swatches">
      {#each families as fam (fam)}
        {@const v = variant(fam, $activeMode)}
        <button
          class="swatch"
          class:active={$activeThemeName === fam}
          style="--sw-bg:{v?.bg ?? '#888'}; --sw-accent:{v?.accent ?? '#888'}"
          onclick={() => selectFamily(fam)}
          title={fam}
          aria-label={`${fam} theme`}
        ></button>
      {/each}
    </div>
  </div>
</header>
