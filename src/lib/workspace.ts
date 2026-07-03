import { get } from 'svelte/store'
import {
  content, currentFile, currentFolder, files, dirty, statusMsg, reloadTrigger,
} from './stores'
import { listMarkdownFiles, readFile, dirName } from './tauri'

/** Open `path`, loading its parent folder into the sidebar. Used for files
 *  opened via OS association, the "Open file…" dialog, and relative links. */
export async function loadFile(path: string) {
  const dir = dirName(path)
  if (dir) {
    currentFolder.set(dir)
    try {
      files.set(await listMarkdownFiles(dir))
    } catch (e) {
      statusMsg.set(`Could not list folder: ${e}`)
    }
  }
  try {
    content.set(await readFile(path))
    currentFile.set(path)
    dirty.set(false)
  } catch (e) {
    statusMsg.set(`Could not open file: ${e}`)
  }
}

/** Manual refresh: re-list the folder and re-read the open file from disk.
 *  An explicit action — unsaved edits are discarded in favor of disk state. */
export async function refreshWorkspace() {
  const folder = get(currentFolder)
  if (!folder) {
    statusMsg.set('Choose a folder first')
    return
  }
  try {
    files.set(await listMarkdownFiles(folder))
  } catch (e) {
    statusMsg.set(`Could not list folder: ${e}`)
    return
  }
  const path = get(currentFile)
  if (path) {
    const hadEdits = get(dirty)
    try {
      content.set(await readFile(path))
      dirty.set(false)
      reloadTrigger.update((n) => n + 1)
    } catch (e) {
      statusMsg.set(`Could not reload: ${e}`)
      return
    }
    statusMsg.set(hadEdits ? 'Refreshed — unsaved edits discarded' : 'Refreshed')
  } else {
    statusMsg.set('Refreshed')
  }
}
