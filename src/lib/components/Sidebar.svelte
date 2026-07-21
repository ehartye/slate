<script lang="ts">
  import { open } from '@tauri-apps/plugin-dialog'
  import { revealItemInDir } from '@tauri-apps/plugin-opener'
  import { currentFolder, files, folders, currentFile, content, dirty, statusMsg, sidebarWidth } from '$lib/stores'
  import { readFile, baseName, dirName } from '$lib/tauri'
  import { loadFile, refreshWorkspace, browseFolder, folderUp } from '$lib/workspace'

  // The up button is enabled only when the current folder actually has a
  // parent to navigate to (e.g. disabled at a filesystem root).
  let canGoUp = $derived(!!$currentFolder && !!dirName($currentFolder))

  let contextMenu = $state<{ x: number; y: number; path: string } | null>(null)

  async function chooseFolder() {
    const picked = await open({ directory: true })
    if (typeof picked !== 'string') return
    await browseFolder(picked)
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

  function showContextMenu(e: MouseEvent, path: string) {
    e.preventDefault()
    contextMenu = { x: e.clientX, y: e.clientY, path }
  }

  function closeContextMenu() {
    contextMenu = null
  }

  async function revealInFileExplorer(path: string) {
    closeContextMenu()
    try {
      await revealItemInDir(path)
    } catch (e) {
      statusMsg.set(`Could not open file explorer: ${e}`)
    }
  }
</script>

<svelte:window
  onclick={closeContextMenu}
  onkeydown={(e) => { if (e.key === 'Escape') closeContextMenu() }}
/>


<aside class="sidebar" style="width: {$sidebarWidth}px">
  <div class="sidebar-head">
    <button
      class="icon-btn"
      onclick={folderUp}
      disabled={!canGoUp}
      title="Go to parent folder"
      aria-label="Go to parent folder"
    >⬆</button>
    <button class="folder-btn" onclick={chooseFolder} title="Choose folder…">
      {$currentFolder ? baseName($currentFolder) : 'Choose folder…'}
    </button>
    <button class="icon-btn" onclick={chooseFile} title="Open markdown file…">🗎</button>
    <button class="icon-btn" onclick={refreshWorkspace} title="Refresh file list and reload from disk">⟳</button>
  </div>
  <ul>
    {#each $folders as path (path)}
      <li>
        <button class="folder-row" onclick={() => browseFolder(path)} title={path}>
          <span class="row-icon" aria-hidden="true">📁</span>{baseName(path)}
        </button>
      </li>
    {/each}
    {#each $files as path (path)}
      <li>
        <button
          class:active={$currentFile === path}
          onclick={() => openFile(path)}
          oncontextmenu={(e) => showContextMenu(e, path)}
        >
          {baseName(path)}
        </button>
      </li>
    {/each}
  </ul>

  {#if contextMenu}
    <div class="context-menu" style="left: {contextMenu.x}px; top: {contextMenu.y}px">
      <button onclick={() => revealInFileExplorer(contextMenu!.path)}>Open in File Explorer</button>
    </div>
  {/if}
</aside>
