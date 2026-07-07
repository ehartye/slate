<script lang="ts">
  import Toolbar from '$lib/components/Toolbar.svelte'
  import Sidebar from '$lib/components/Sidebar.svelte'
  import StatusBar from '$lib/components/StatusBar.svelte'
  import Editor from '$lib/components/Editor.svelte'
  import Preview from '$lib/components/Preview.svelte'
  import { onMount } from 'svelte'
  import { invoke } from '@tauri-apps/api/core'
  import { listen } from '@tauri-apps/api/event'
  import {
    content, currentFile, dirty, statusMsg, editorScroll,
    sidebarCollapsed, editorCollapsed, previewCollapsed, previewZoom, reloadTrigger,
    sidebarWidth,
  } from '$lib/stores'
  import { writeFile, readFile } from '$lib/tauri'
  import { loadFile } from '$lib/workspace'
  import { loadZoom, setZoom, nudgeZoom } from '$lib/zoom'
  import { loadSidebarWidth, clampSidebarWidth, persistSidebarWidth } from '$lib/sidebarWidth'
  import { clearImageCache } from '$lib/images'
  import '@fontsource/press-start-2p/400.css'
  import '@fontsource/vt323/400.css'
  import '@fontsource/ibm-plex-mono/400.css'
  import '@fontsource/ibm-plex-mono/600.css'
  import '@fontsource/eb-garamond/400.css'
  import '@fontsource/eb-garamond/600.css'
  import '@fontsource/newsreader/400.css'
  import '@fontsource/newsreader/400-italic.css'
  import '@fontsource/newsreader/600.css'
  import '@fontsource/hanken-grotesk/400.css'
  import '@fontsource/hanken-grotesk/600.css'
  import '@fontsource/hanken-grotesk/700.css'
  import '@fontsource/orbitron/600.css'
  import '@fontsource/orbitron/700.css'
  import '$lib/styles/base.css'

  let previewPane = $state<HTMLElement>()
  let editorFlex = $state(1)
  let suppressNextChange = false

  // Restore the remembered preview zoom.
  previewZoom.set(loadZoom())
  sidebarWidth.set(loadSidebarWidth())

  // Keep the file watcher in sync with whichever file is open.
  $effect(() => {
    const path = $currentFile
    if (path) invoke('watch_file', { path }).catch(() => {})
    else invoke('unwatch_file').catch(() => {})
  })

  // Load a file passed on launch (Windows: CLI arg, macOS: Apple Events).
  // Also listen for files opened while the app is already running (macOS Finder).
  onMount(async () => {
    let startup: string | null = null
    try {
      startup = await invoke<string | null>('get_startup_file')
    } catch {
      return // not in a Tauri context
    }
    if (startup) await loadFile(startup)

    const unlisten = await listen<string>('open-file', (event) => loadFile(event.payload))

    const unlistenChanged = await listen<string>('file-changed', async (event) => {
      if (suppressNextChange) { suppressNextChange = false; return }
      if ($dirty) {
        statusMsg.set('File changed on disk — save or discard changes to reload')
        return
      }
      try {
        content.set(await readFile(event.payload))
        clearImageCache()
        reloadTrigger.update(n => n + 1)
        statusMsg.set('Reloaded from disk')
      } catch (e) {
        statusMsg.set(`Could not reload: ${e}`)
      }
    })

    return () => { unlisten(); unlistenChanged() }
  })

  function startDrag(e: MouseEvent) {
    e.preventDefault()
    const split = (e.currentTarget as HTMLElement).parentElement!
    const rect = split.getBoundingClientRect()
    function move(ev: MouseEvent) {
      const clamped = Math.min(0.8, Math.max(0.2, (ev.clientX - rect.left) / rect.width))
      editorFlex = clamped / (1 - clamped)
    }
    function up() {
      window.removeEventListener('mousemove', move)
      window.removeEventListener('mouseup', up)
    }
    window.addEventListener('mousemove', move)
    window.addEventListener('mouseup', up)
  }

  function startSidebarDrag(e: MouseEvent) {
    e.preventDefault()
    const sidebarEl = (e.currentTarget as HTMLElement).previousElementSibling as HTMLElement
    const rect = sidebarEl.getBoundingClientRect()
    function move(ev: MouseEvent) {
      sidebarWidth.set(clampSidebarWidth(ev.clientX - rect.left))
    }
    function up() {
      window.removeEventListener('mousemove', move)
      window.removeEventListener('mouseup', up)
      persistSidebarWidth()
    }
    window.addEventListener('mousemove', move)
    window.addEventListener('mouseup', up)
  }

  // Mirror the editor's scroll fraction onto the preview pane.
  $effect(() => {
    const frac = $editorScroll
    if (!previewPane) return
    previewPane.scrollTop = frac * (previewPane.scrollHeight - previewPane.clientHeight)
  })

  // Auto-clear transient status messages after 4s.
  let statusTimer: ReturnType<typeof setTimeout> | null = null
  $effect(() => {
    if ($statusMsg) {
      if (statusTimer) clearTimeout(statusTimer)
      statusTimer = setTimeout(() => statusMsg.set(''), 4000)
    }
  })

  async function save() {
    const path = $currentFile
    if (!path) {
      statusMsg.set('Open a file before saving')
      return
    }
    try {
      suppressNextChange = true
      await writeFile(path, $content)
      dirty.set(false)
      statusMsg.set('')
    } catch (e) {
      suppressNextChange = false
      statusMsg.set(`Save failed: ${e}`)
    }
  }

  function onKeydown(e: KeyboardEvent) {
    if (!(e.ctrlKey || e.metaKey)) return
    if (e.key.toLowerCase() === 's') {
      e.preventDefault()
      save()
    } else if (e.key === '=' || e.key === '+') {
      e.preventDefault()
      nudgeZoom(1)
    } else if (e.key === '-' || e.key === '_') {
      e.preventDefault()
      nudgeZoom(-1)
    } else if (e.key === '0') {
      e.preventDefault()
      setZoom(1)
    }
  }
</script>

<svelte:window onkeydown={onKeydown} />

<div class="app">
  <Toolbar />
  <div class="body">
    {#if !$sidebarCollapsed}
      <Sidebar />
      <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
      <div class="sidebar-divider" onmousedown={startSidebarDrag} role="separator" aria-orientation="vertical" aria-label="Resize file browser"></div>
    {/if}
    <div class="split">
      {#if $editorCollapsed}
        <button class="rail" onclick={() => editorCollapsed.set(false)} title="Expand editor">
          <span class="rail-icon">›</span><span class="rail-label">Editor</span>
        </button>
      {:else}
        <main class="editor-pane pane" style="flex:{$previewCollapsed ? 1 : editorFlex}">
          <div class="pane-head">
            <span class="label">Editor</span>
            {#if !$previewCollapsed}
              <button class="collapse-btn" onclick={() => editorCollapsed.set(true)} title="Collapse editor">‹</button>
            {/if}
          </div>
          <div class="pane-content">
            {#if $currentFile}<Editor />{:else}<div class="empty">Choose a folder, then pick a file to edit.</div>{/if}
          </div>
        </main>
      {/if}

      {#if !$editorCollapsed && !$previewCollapsed}
        <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
        <div class="divider" onmousedown={startDrag} role="separator" aria-orientation="vertical" aria-label="Resize editor and preview"></div>
      {/if}

      {#if $previewCollapsed}
        <button class="rail right" onclick={() => previewCollapsed.set(false)} title="Expand preview">
          <span class="rail-icon">‹</span><span class="rail-label">Preview</span>
        </button>
      {:else}
        <section class="preview-pane pane" style="flex:{$editorCollapsed ? 1 : 1}">
          <div class="pane-head">
            <span class="label">Preview</span>
            {#if !$editorCollapsed}
              <button class="collapse-btn" onclick={() => previewCollapsed.set(true)} title="Collapse preview">›</button>
            {/if}
          </div>
          <div class="pane-content preview-scroll" bind:this={previewPane}><Preview /></div>
        </section>
      {/if}
    </div>
  </div>
  <StatusBar />
</div>
