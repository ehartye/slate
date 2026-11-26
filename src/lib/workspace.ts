import { get } from 'svelte/store'
import {
  content, currentFile, currentFolder, files, folders, dirty, statusMsg, reloadTrigger,
  mdOnlyMode, showHiddenFiles,
} from './stores'
import { listMarkdownFiles, listTextFiles, listSubfolders, readFile, dirName, createFile, baseName } from './tauri'
import { extensionOf } from './fileKind'
import { openTab } from './tabs'

/** Populate the `files`/`folders` stores for `dir`, honoring the current
 *  "Markdown only" and "show hidden files" settings. Shared by every place
 *  that needs to (re)list a directory's contents for the sidebar. */
export async function listWorkspace(dir: string): Promise<void> {
  const showHidden = get(showHiddenFiles)
  const listFiles = get(mdOnlyMode) ? listMarkdownFiles : listTextFiles
  const [fileList, folderList] = await Promise.all([
    listFiles(dir, showHidden),
    listSubfolders(dir, showHidden),
  ])
  files.set(fileList)
  folders.set(folderList)
}

/** Open `path` as a tab, loading its parent folder into the sidebar. Used
 *  for files opened via OS association, the "Open file…" dialog, and
 *  relative links — switches to an already-open tab instead of duplicating it. */
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
  await openTab(path)
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

/** Re-list the currently browsed folder, if any — a no-op otherwise. Used
 *  after toggling a file-browser filter (Markdown-only, show hidden files)
 *  so the sidebar reflects the new setting immediately. */
export async function relistCurrentFolder() {
  const dir = get(currentFolder)
  if (!dir) return
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
      content.load(await readFile(path))
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

/** The file name "New file" will actually create for what the user typed.
 *  With "Markdown only" on, a bare name (no extension) becomes a markdown
 *  file — "notes" means notes.md in a markdown browser. With it off, a bare
 *  name stays bare: `Makefile`, `LICENSE` and `Dockerfile` are real names.
 *  Dotfiles (`.env`) count as having an extension, so they're never touched. */
export function resolveNewFileName(input: string, mdOnly: boolean): string {
  const name = input.trim()
  if (!name) return name
  return mdOnly && extensionOf(name) === '' ? `${name}.md` : name
}

/** Create a new, empty file in the folder the sidebar is showing, list it, and
 *  open it in a tab ready to type into. Returns an error message for the user
 *  (the name is taken, invalid, …) or null on success — the inline name field
 *  shows the message beside what they typed rather than as a transient
 *  status, so it can be corrected in place. */
export async function createFileInCurrentFolder(input: string): Promise<string | null> {
  const folder = get(currentFolder)
  if (!folder) return 'Choose a folder first'
  const name = resolveNewFileName(input, get(mdOnlyMode))
  if (!name) return 'Enter a file name'

  let path: string
  try {
    path = await createFile(folder, name)
  } catch (e) {
    return String(e)
  }
  try {
    await listWorkspace(folder)
  } catch (e) {
    statusMsg.set(`Could not list folder: ${e}`)
  }
  await openTab(path)
  statusMsg.set(
    get(files).includes(path)
      ? `Created ${baseName(path)}`
      : `Created ${baseName(path)} — turn off Markdown only to see it in the list`,
  )
  return null
}
