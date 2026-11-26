<script lang="ts">
  import { tick } from 'svelte'
  import { open } from '@tauri-apps/plugin-dialog'
  import { revealItemInDir } from '@tauri-apps/plugin-opener'
  import {
    currentFolder, files, folders, currentFile, statusMsg, sidebarWidth,
    showHiddenFiles, mdOnlyMode,
  } from '$lib/stores'
  import { baseName, dirName } from '$lib/tauri'
  import {
    loadFile, refreshWorkspace, browseFolder, folderUp, relistCurrentFolder,
    createFileInCurrentFolder, resolveNewFileName,
  } from '$lib/workspace'
  import { openTab } from '$lib/tabs'
  import { setShowHiddenFiles } from '$lib/viewOptions'
  import { isMac } from '$lib/platform'
  import { tip } from '$lib/tooltip'
  import Icon from './Icon.svelte'
  import ContextMenu, { type MenuItem } from './ContextMenu.svelte'

  // The up button is enabled only when the current folder actually has a
  // parent to navigate to (e.g. disabled at a filesystem root).
  let canGoUp = $derived(!!$currentFolder && !!dirName($currentFolder))

  let menu = $state<{ x: number; y: number; items: MenuItem[] } | null>(null)

  // Inline "New file" field: shown at the top of the file list while naming.
  let naming = $state(false)
  let newName = $state('')
  let nameError = $state('')
  let creating = $state(false)
  let nameInput = $state<HTMLInputElement>()
  // What will actually be created, shown under the field when it differs from
  // what's typed (a bare name gaining ".md").
  let resolvedName = $derived(resolveNewFileName(newName, $mdOnlyMode))

  async function chooseFolder() {
    const picked = await open({ directory: true })
    if (typeof picked !== 'string') return
    await browseFolder(picked)
  }

  async function chooseFile() {
    const picked = await open({
      // Markdown-only mode restricts the picker to match; off, any file
      // can be picked (the sidebar's own listing is the curated browse view).
      filters: $mdOnlyMode ? [{ name: 'Markdown', extensions: ['md', 'markdown'] }] : undefined,
    })
    if (typeof picked !== 'string') return
    await loadFile(picked)
  }

  async function toggleHiddenFiles() {
    setShowHiddenFiles(!$showHiddenFiles)
    await relistCurrentFolder()
  }

  async function startNaming() {
    if (!$currentFolder) return
    naming = true
    newName = ''
    nameError = ''
    await tick()
    nameInput?.focus()
  }

  function stopNaming() {
    naming = false
    newName = ''
    nameError = ''
  }

  async function submitName() {
    if (creating) return
    creating = true
    const error = await createFileInCurrentFolder(newName)
    creating = false
    if (error) {
      nameError = error
      nameInput?.focus()
      return
    }
    stopNaming()
  }

  function onNameKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter') { e.preventDefault(); submitName() }
    else if (e.key === 'Escape') { e.preventDefault(); stopNaming() }
  }

  // Clicking away from an empty field abandons it; one with a name in it stays
  // open, so a stray click doesn't throw away what was typed.
  function onNameBlur() {
    if (!newName.trim() && !creating) stopNaming()
  }

  function showFileMenu(e: MouseEvent, path: string) {
    e.preventDefault()
    menu = {
      x: e.clientX,
      y: e.clientY,
      items: [
        { label: 'Open', action: () => openTab(path) },
        { separator: true },
        { label: isMac ? 'Reveal in Finder' : 'Show in File Explorer', action: () => reveal(path) },
      ],
    }
  }

  async function reveal(path: string) {
    try {
      await revealItemInDir(path)
    } catch (e) {
      statusMsg.set(`Could not open ${isMac ? 'Finder' : 'File Explorer'}: ${e}`)
    }
  }
</script>

<aside class="sidebar" style="width: {$sidebarWidth}px">
  <div class="sidebar-head">
    <div class="folder-line">
      <button
        class="icon-btn"
        onclick={() => canGoUp && folderUp()}
        aria-disabled={!canGoUp}
        use:tip={{ label: 'Parent folder', hint: canGoUp ? undefined : 'Already at the top' }}
      ><Icon name="up" /></button>
      <button
        class="folder-btn"
        onclick={chooseFolder}
        use:tip={{ label: $currentFolder ? 'Choose another folder' : 'Choose a folder', hint: $currentFolder ?? undefined }}
      >
        <Icon name="folder" size={14} />
        <span class="folder-name">{$currentFolder ? baseName($currentFolder) : 'Choose folder…'}</span>
        <Icon name="chevron" size={12} />
      </button>
    </div>

    <div class="sidebar-actions">
      <span class="file-count">
        {#if $currentFolder}{$files.length} {$files.length === 1 ? 'file' : 'files'}{/if}
      </span>
      <div class="tool-group" role="toolbar" aria-label="File browser">
        <button
          class="tool-btn"
          onclick={startNaming}
          aria-disabled={!$currentFolder}
          use:tip={{ label: 'New file', hint: $currentFolder ? `In ${baseName($currentFolder)}` : 'Choose a folder first' }}
        ><Icon name="file-plus" /></button>
        <button
          class="tool-btn"
          onclick={chooseFile}
          use:tip={{ label: $mdOnlyMode ? 'Open markdown file…' : 'Open file…' }}
        ><Icon name="file-open" /></button>
        <span class="tool-sep" aria-hidden="true"></span>
        <button
          class="tool-btn"
          onclick={toggleHiddenFiles}
          aria-pressed={$showHiddenFiles}
          use:tip={{ label: 'Hidden files', hint: $showHiddenFiles ? 'Shown — click to hide' : 'Hidden — click to show' }}
        ><Icon name={$showHiddenFiles ? 'eye' : 'eye-off'} /></button>
        <button
          class="tool-btn"
          onclick={refreshWorkspace}
          use:tip={{ label: 'Refresh', hint: 'Re-list files and reload the open file from disk' }}
        ><Icon name="refresh" /></button>
      </div>
    </div>
  </div>

  {#if !$currentFolder}
    <div class="sidebar-empty">
      <p>Pick a folder to browse its files.</p>
      <button class="empty-cta" onclick={chooseFolder}><Icon name="folder" size={14} />Choose folder…</button>
    </div>
  {/if}

  <ul>
    {#if naming}
      <li class="new-file" class:invalid={!!nameError}>
        <div class="new-file-field">
          <Icon name="file-plus" size={14} />
          <input
            bind:this={nameInput}
            bind:value={newName}
            oninput={() => (nameError = '')}
            onkeydown={onNameKeydown}
            onblur={onNameBlur}
            placeholder={$mdOnlyMode ? 'name' : 'name.ext'}
            aria-label="New file name"
            aria-invalid={!!nameError}
            aria-describedby="new-file-note"
            spellcheck="false"
            autocomplete="off"
            disabled={creating}
          />
        </div>
        <div class="new-file-note" id="new-file-note" role={nameError ? 'alert' : undefined}>
          {#if nameError}
            {nameError}
          {:else if resolvedName && resolvedName !== newName.trim()}
            Creates <strong>{resolvedName}</strong> · <kbd>Enter</kbd>
          {:else}
            <kbd>Enter</kbd> create · <kbd>Esc</kbd> cancel
          {/if}
        </div>
      </li>
    {/if}
    {#each $folders as path (path)}
      <li>
        <button class="folder-row" onclick={() => browseFolder(path)} title={path}>
          <Icon name="folder" size={14} />{baseName(path)}
        </button>
      </li>
    {/each}
    {#each $files as path (path)}
      <li>
        <button
          class:active={$currentFile === path}
          onclick={() => openTab(path)}
          oncontextmenu={(e) => showFileMenu(e, path)}
        >
          {baseName(path)}
        </button>
      </li>
    {/each}
  </ul>

  {#if menu}
    <ContextMenu x={menu.x} y={menu.y} items={menu.items} label="File actions" onclose={() => (menu = null)} />
  {/if}
</aside>
