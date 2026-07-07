<script lang="ts">
  import { open } from '@tauri-apps/plugin-dialog'
  import { currentFolder, files, currentFile, content, dirty, statusMsg, sidebarWidth } from '$lib/stores'
  import { listMarkdownFiles, readFile, baseName } from '$lib/tauri'
  import { loadFile, refreshWorkspace } from '$lib/workspace'

  async function chooseFolder() {
    const picked = await open({ directory: true })
    if (typeof picked !== 'string') return
    currentFolder.set(picked)
    try {
      files.set(await listMarkdownFiles(picked))
    } catch (e) {
      statusMsg.set(`Could not list folder: ${e}`)
    }
  }

  async function chooseFile() {
    const picked = await open({
      filters: [{ name: 'Markdown', extensions: ['md', 'markdown'] }],
    })
    if (typeof picked !== 'string') return
    await loadFile(picked)
  }

  async function openFile(path: string) {
    try {
      const text = await readFile(path)
      content.set(text)
      currentFile.set(path)
      dirty.set(false)
    } catch (e) {
      statusMsg.set(`Could not open file: ${e}`)
    }
  }
</script>

<aside class="sidebar" style="width: {$sidebarWidth}px">
  <div class="sidebar-head">
    <button class="folder-btn" onclick={chooseFolder} title="Choose folder…">
      {$currentFolder ? baseName($currentFolder) : 'Choose folder…'}
    </button>
    <button class="icon-btn" onclick={chooseFile} title="Open markdown file…">🗎</button>
    <button class="icon-btn" onclick={refreshWorkspace} title="Refresh file list and reload from disk">⟳</button>
  </div>
  <ul>
    {#each $files as path (path)}
      <li>
        <button class:active={$currentFile === path} onclick={() => openFile(path)}>
          {baseName(path)}
        </button>
      </li>
    {/each}
  </ul>
</aside>
