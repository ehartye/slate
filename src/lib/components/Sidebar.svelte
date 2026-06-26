<script lang="ts">
  import { open } from '@tauri-apps/plugin-dialog'
  import { currentFolder, files, currentFile, content, dirty, statusMsg } from '$lib/stores'
  import { listMarkdownFiles, readFile, baseName } from '$lib/tauri'

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

<aside class="sidebar">
  <button class="folder-btn" onclick={chooseFolder}>
    {$currentFolder ? baseName($currentFolder) : 'Choose folder…'}
  </button>
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
