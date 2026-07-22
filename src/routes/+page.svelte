<script lang="ts">
  import Toolbar from '$lib/components/Toolbar.svelte'
  import Sidebar from '$lib/components/Sidebar.svelte'
  import StatusBar from '$lib/components/StatusBar.svelte'
  import TabBar from '$lib/components/TabBar.svelte'
  import Editor from '$lib/components/Editor.svelte'
  import Preview from '$lib/components/Preview.svelte'
  import PdfViewer from '$lib/components/PdfViewer.svelte'
  import { onMount } from 'svelte'
  import { invoke } from '@tauri-apps/api/core'
  import { listen } from '@tauri-apps/api/event'
  import {
    content, currentFile, dirty, statusMsg, editorScroll, tabs, activeTabId,
    sidebarCollapsed, editorCollapsed, previewCollapsed, previewZoom, reloadTrigger,
    sidebarWidth, findOpen, mdOnlyMode, showHiddenFiles,
  } from '$lib/stores'
  import { writeFile, readFile, openNewWindow, baseName } from '$lib/tauri'
  import { loadFile } from '$lib/workspace'
  import { closeTab, cycleTab, markBackgroundTabForReload } from '$lib/tabs'
  import { isMarkdownPath, isPdfPath } from '$lib/fileKind'
  import { loadZoom, setZoom, nudgeZoom } from '$lib/zoom'
  import { loadSidebarWidth, clampSidebarWidth, persistSidebarWidth } from '$lib/sidebarWidth'
  import { loadMdOnlyMode, loadShowHiddenFiles } from '$lib/viewOptions'
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
  // A pdf tab has no CodeMirror doc at all, so the Editor pane (and its
  // collapse rail) is hidden entirely and the preview/pdf pane always shows
  // full-width, regardless of the user's editorCollapsed/previewCollapsed
  // preferences for text tabs — there'd be nothing else to display otherwise.
  let isPdfActive = $derived(isPdfPath($currentFile))
  // Paths whose *next* file-changed event should be ignored (our own save,
  // not an external edit) — per-path since several tabs can be open at once.
  let suppressNextChangeFor = new Set<string>()

  // Restore the remembered preview zoom.
  previewZoom.set(loadZoom())
  sidebarWidth.set(loadSidebarWidth())
  mdOnlyMode.set(loadMdOnlyMode())
  showHiddenFiles.set(loadShowHiddenFiles())

  // Keep the file watchers in sync with whichever tabs are open — one
  // watch_file per open tab, not just the active one.
  let watchedPaths = new Set<string>()
  $effect(() => {
    const paths = new Set($tabs.map((t) => t.path))
    for (const p of paths) {
      if (!watchedPaths.has(p)) invoke('watch_file', { path: p }).catch(() => {})
    }
    for (const p of watchedPaths) {
      if (!paths.has(p)) invoke('unwatch_file', { path: p }).catch(() => {})
    }
    watchedPaths = paths
  })

  // Load a file passed on launch (Windows: CLI arg, macOS: Apple Events), or one
  // passed via `?open=` when this window was spawned to open a specific file
  // (macOS hot file-open, or a future "open in new window" action).
  // Also listen for files opened while the app is already running (macOS Finder).
  onMount(async () => {
    const openParam = new URLSearchParams(window.location.search).get('open')
    let startup: string | null = null
    if (openParam) {
      startup = openParam
    } else {
      try {
        startup = await invoke<string | null>('get_startup_file')
      } catch {
        return // not in a Tauri context
      }
    }
    if (startup) await loadFile(startup)

    const unlisten = await listen<string>('open-file', (event) => loadFile(event.payload))

    const unlistenChanged = await listen<string>('file-changed', async (event) => {
      const path = event.payload
      if (suppressNextChangeFor.delete(path)) return

      if (path !== $currentFile) {
        // A background tab's file changed — mark it, reload lazily when
        // the user actually switches to it (tabs.ts's switchToTab).
        if (markBackgroundTabForReload(path)) {
          statusMsg.set(`"${baseName(path)}" changed on disk`)
        }
        return
      }
      if ($dirty) {
        statusMsg.set('File changed on disk — save or discard changes to reload')
        return
      }
      try {
        content.set(await readFile(path))
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
    if (!isMarkdownPath(path)) {
      statusMsg.set('Read-only — only markdown files can be edited')
      return
    }
    try {
      suppressNextChangeFor.add(path)
      await writeFile(path, $content)
      dirty.set(false)
      statusMsg.set('')
    } catch (e) {
      suppressNextChangeFor.delete(path)
      statusMsg.set(`Save failed: ${e}`)
    }
  }

  function onKeydown(e: KeyboardEvent) {
    if (!(e.ctrlKey || e.metaKey)) return
    if (e.key.toLowerCase() === 's') {
      e.preventDefault()
      save()
    } else if (e.key.toLowerCase() === 'n') {
      e.preventDefault()
      openNewWindow().catch((err) => statusMsg.set(`Could not open new window: ${err}`))
    } else if (e.key.toLowerCase() === 'w') {
      e.preventDefault()
      if ($activeTabId) closeTab($activeTabId)
    } else if (e.key === 'Tab' && $tabs.length > 1) {
      e.preventDefault()
      cycleTab(e.shiftKey ? -1 : 1)
    } else if (e.key === '=' || e.key === '+') {
      e.preventDefault()
      nudgeZoom(1)
    } else if (e.key === '-' || e.key === '_') {
      e.preventDefault()
      nudgeZoom(-1)
    } else if (e.key === '0') {
      e.preventDefault()
      setZoom(1)
    } else if (e.key.toLowerCase() === 'f') {
      e.preventDefault()
      if ($previewCollapsed) previewCollapsed.set(false)
      findOpen.set(true)
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
    <div class="content-area">
      <TabBar />
      <div class="split">
      {#if !isPdfActive}
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
      {/if}

      {#if $previewCollapsed && !isPdfActive}
        <button class="rail right" onclick={() => previewCollapsed.set(false)} title="Expand preview">
          <span class="rail-icon">‹</span><span class="rail-label">Preview</span>
        </button>
      {:else}
        <section class="preview-pane pane" style="flex:1">
          <div class="pane-head">
            <span class="label">{isPdfActive ? 'PDF' : 'Preview'}</span>
            {#if !$editorCollapsed && !isPdfActive}
              <button class="collapse-btn" onclick={() => previewCollapsed.set(true)} title="Collapse preview">›</button>
            {/if}
          </div>
          <div class="pane-content preview-scroll" bind:this={previewPane}>
            {#if isPdfActive}<PdfViewer />{:else}<Preview />{/if}
          </div>
        </section>
      {/if}
      </div>
    </div>
  </div>
  <StatusBar />
</div>
