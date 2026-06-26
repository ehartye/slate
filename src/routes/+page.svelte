<script lang="ts">
  import Toolbar from '$lib/components/Toolbar.svelte'
  import Sidebar from '$lib/components/Sidebar.svelte'
  import StatusBar from '$lib/components/StatusBar.svelte'
  import Editor from '$lib/components/Editor.svelte'
  import Preview from '$lib/components/Preview.svelte'
  import { content, currentFile, dirty, statusMsg, editorScroll } from '$lib/stores'
  import { writeFile } from '$lib/tauri'
  import '$lib/styles/base.css'

  let previewPane: HTMLElement
  let editorFlex = $state(1)

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

  // Mirror the editor's scroll fraction onto the preview pane.
  $effect(() => {
    const frac = $editorScroll
    if (!previewPane) return
    previewPane.scrollTop = frac * (previewPane.scrollHeight - previewPane.clientHeight)
  })

  async function save() {
    const path = $currentFile
    if (!path) return
    try {
      await writeFile(path, $content)
      dirty.set(false)
      statusMsg.set('')
    } catch (e) {
      statusMsg.set(`Save failed: ${e}`)
    }
  }

  function onKeydown(e: KeyboardEvent) {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
      e.preventDefault()
      save()
    }
  }
</script>

<svelte:window onkeydown={onKeydown} />

<div class="app">
  <Toolbar />
  <div class="body">
    <Sidebar />
    <div class="split">
      <main class="editor-pane" style="flex:{editorFlex}"><Editor /></main>
      <div class="divider" onmousedown={startDrag} role="separator" aria-orientation="vertical"></div>
      <section class="preview-pane" bind:this={previewPane}><Preview /></section>
    </div>
  </div>
  <StatusBar />
</div>
