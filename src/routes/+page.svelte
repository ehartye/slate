<script lang="ts">
  import Toolbar from '$lib/components/Toolbar.svelte'
  import Sidebar from '$lib/components/Sidebar.svelte'
  import StatusBar from '$lib/components/StatusBar.svelte'
  import Editor from '$lib/components/Editor.svelte'
  import { content, currentFile, dirty, statusMsg } from '$lib/stores'
  import { writeFile } from '$lib/tauri'
  import '$lib/styles/base.css'

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
    <main class="editor-pane"><Editor /></main>
    <section class="preview-pane"><pre>{$content}</pre></section>
  </div>
  <StatusBar />
</div>
