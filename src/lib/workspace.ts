import { get } from 'svelte/store'
import {
  content, currentFile, currentFolder, files, folders, dirty, statusMsg, reloadTrigger,
} from './stores'
import { listMarkdownFiles, listSubfolders, readFile, dirName } from './tauri'

/** Populate the `files`/`folders` stores for `dir`. Shared by every place
 *  that needs to (re)list a directory's contents for the sidebar. */
async function listWorkspace(dir: string): Promise<void> {
  const [fileList, folderList] = await Promise.all([
    listMarkdownFiles(dir),
    listSubfolders(dir),
  ])
  files.set(fileList)
  folders.set(folderList)
}

/** Open `path`, loading its parent folder into the sidebar. Used for files
 *  opened via OS association, the "Open file…" dialog, and relative links. */
export async function loadFile(path: string) {
  const dir = dirName(path)
  if (dir) {
    currentFolder.set(dir)
    try {
      await listWorkspace(dir)
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

/** Navigate the sidebar into `dir` — re-list its files/subfolders — without
 *  opening any file. Used for the folder-up button and clicking a subfolder. */
export async function browseFolder(dir: string) {
  currentFolder.set(dir)
  try {
    await listWorkspace(dir)
  } catch (e) {
    statusMsg.set(`Could not list folder: ${e}`)
  }
}

/** Navigate up to the parent of the currently browsed folder, if any. */
export async function folderUp() {
  const dir = get(currentFolder)
  if (!dir) return
  const parent = dirName(dir)
  if (!parent || parent === dir) return
  await browseFolder(parent)
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
    await listWorkspace(folder)
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

