<script lang="ts">
  import { onMount } from 'svelte'
  import { invoke } from '@tauri-apps/api/core'
  import {
    currentFile, currentFolder, content, dirty,
    themes, activeThemeName, activeMode,
    sidebarCollapsed,
  } from '$lib/stores'
  import { baseName } from '$lib/tauri'
  import { listThemes, applyThemeVariant, savedThemeChoice, type Theme } from '$lib/theme'
  import { renderMarkdown } from '$lib/markdown'
  import { buildStandaloneHtml, collectThemeFontCss } from '$lib/export'
  import ThemePanel from './ThemePanel.svelte'

  let panelOpen = $state(false)

  // Current theme variant (for the toolbar button's swatch + label).
  let current = $derived(
    $themes.find((t) => t.name === $activeThemeName && t.mode === $activeMode),
  )

  onMount(async () => {
    const loaded = await listThemes()
    themes.set(loaded)
    const saved = savedThemeChoice()
    const pick =
      (saved && loaded.find((t) => t.name === saved.name && t.mode === saved.mode)) ??
      loaded.find((t) => t.name === 'Aurora' && t.mode === 'dark') ??
      loaded[0]
    if (pick) applyThemeVariant(pick)
  })

  async function openInBrowser() {
    const theme = $themes.find((t) => t.name === $activeThemeName && t.mode === $activeMode)
    const fontCss = await collectThemeFontCss(theme?.css ?? '')
    const html = buildStandaloneHtml(
      renderMarkdown($content),
      theme?.css ?? '',
      $currentFile ? baseName($currentFile) : 'Slate',
      fontCss,
    )
    await invoke('open_in_browser', { html })
  }
</script>

<header class="toolbar">
  <button
    class="icon-btn sidebar-toggle"
    onclick={() => sidebarCollapsed.update((v) => !v)}
    title={$sidebarCollapsed ? 'Show file browser' : 'Hide file browser'}
    aria-label="Toggle file browser"
    aria-pressed={!$sidebarCollapsed}
  >
    <!-- App frame with the sidebar pane: filled while shown, empty while hidden. -->
    <svg width="16" height="14" viewBox="0 0 16 14" aria-hidden="true">
      <rect x="0.75" y="0.75" width="14.5" height="12.5" rx="2.5"
        fill="none" stroke="currentColor" stroke-width="1.5"/>
      {#if $sidebarCollapsed}
        <line x1="6" y1="0.75" x2="6" y2="13.25" stroke="currentColor" stroke-width="1.5"/>
      {:else}
        <path d="M3.25 0.75 H6 V13.25 H3.25 A2.5 2.5 0 0 1 0.75 10.75 V3.25 A2.5 2.5 0 0 1 3.25 0.75 Z"
          fill="currentColor"/>
      {/if}
    </svg>
  </button>
  <span class="brand"><span class="brand-dot"></span>Slate</span>
  {#if $currentFile}
    <span class="file">{baseName($currentFile)}{#if $dirty}<span class="file-dot" title="Unsaved"></span>{/if}</span>
  {/if}
  {#if $currentFolder}<span class="muted">{$currentFolder}</span>{/if}

  <span class="spacer"></span>

  <button class="browser-btn" onclick={openInBrowser} title="Open the rendered document in your browser">
    Open in browser <span class="arrow">↗</span>
  </button>

  <button
    class="theme-open-btn"
    class:active={panelOpen}
    onclick={() => (panelOpen = !panelOpen)}
    title="Choose a theme"
  >
    <span
      class="tb-swatch"
      style="--sw-bg:{current?.bg ?? '#888'}; --sw-accent:{current?.accent ?? '#888'}"
    ></span>
    <span class="tb-label">{$activeThemeName ?? 'Theme'} · {$activeMode}</span>
    <span class="tb-caret">▾</span>
  </button>
</header>

{#if panelOpen}
  <ThemePanel onclose={() => (panelOpen = false)} />
{/if}
