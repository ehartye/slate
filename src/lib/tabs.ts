// Tab lifecycle: open/switch/close. Each tab remembers its own dirty state
// and scroll fraction; the CodeMirror EditorState per tab is cached inside
// Editor.svelte (the only place that needs it), and swapped in via
// `view.setState(...)` when `activeTabId` changes — the idiomatic CodeMirror 6
// pattern for one editor view backing several open documents.
//
// PDF tabs are a separate case (a PDF isn't text, so there's no CodeMirror
// doc at all): their rendered content lives in the `pdfDataUrl` store instead
// of `content`, backed by `pdfCache` below — a per-tab cache kept here rather
// than in PdfViewer.svelte, since (unlike Editor.svelte, which stays mounted
// for the whole session) PdfViewer only mounts while a PDF tab is active, so
// a component-local cache would be lost every time the user tabs away from
// all PDFs and back.
import { get } from 'svelte/store'
import {
  tabs, activeTabId, currentFile, content, dirty, editorScroll, reloadTrigger, statusMsg,
  pdfDataUrl, type Tab,
} from './stores'
import { readFile, readPdfAsDataUrl } from './tauri'
import { isPdfPath } from './fileKind'

let counter = 0
/** A unique-enough id for the lifetime of the app; tabs aren't persisted. */
function nextTabId(): string {
  counter += 1
  return `tab-${counter}`
}

const pdfCache = new Map<string, string>() // tab id -> data: URL

/** The currently open tab with this path, if any. */
export function findTabByPath(path: string): Tab | undefined {
  return get(tabs).find((t) => t.path === path)
}

/** Snapshot the active tab's live values back into its tabs-array entry —
 *  call this before switching away from it so nothing is lost. */
function captureActiveTabState(): void {
  const id = get(activeTabId)
  if (!id) return
  const snapshotDirty = get(dirty)
  const snapshotScroll = get(editorScroll)
  tabs.update((ts) =>
    ts.map((t) => (t.id === id ? { ...t, dirty: snapshotDirty, scrollFraction: snapshotScroll } : t)),
  )
}

/** Open `path` as a tab: switches to it if already open, otherwise reads the
 *  file and creates+activates a new tab. Shared by the sidebar, "Open file…"
 *  dialog, OS file-association opens, and relative-link navigation — anywhere
 *  that previously just set `currentFile`/`content` directly. */
export async function openTab(path: string): Promise<void> {
  const existing = findTabByPath(path)
  if (existing) {
    await switchToTab(existing.id)
    return
  }

  const tab: Tab = { id: nextTabId(), path, dirty: false, scrollFraction: 0, needsReload: false }

  if (isPdfPath(path)) {
    let dataUrl: string
    try {
      dataUrl = await readPdfAsDataUrl(path)
    } catch (e) {
      statusMsg.set(`Could not open file: ${e}`)
      return
    }
    captureActiveTabState()
    pdfCache.set(tab.id, dataUrl)
    tabs.update((ts) => [...ts, tab])
    activeTabId.set(tab.id)
    currentFile.set(path)
    content.set('')
    dirty.set(false)
    pdfDataUrl.set(dataUrl)
    return
  }

  let text: string
  try {
    text = await readFile(path)
  } catch (e) {
    statusMsg.set(`Could not open file: ${e}`)
    return
  }
  captureActiveTabState()
  tabs.update((ts) => [...ts, tab])
  activeTabId.set(tab.id)
  currentFile.set(path)
  content.set(text)
  dirty.set(false)
  editorScroll.set(0)
  pdfDataUrl.set(null)
}

/** Switch to an already-open tab by id. Restores its dirty/scroll snapshot;
 *  if the file changed on disk while this tab was inactive (and it has no
 *  unsaved edits), reloads it from disk now. */
export async function switchToTab(id: string): Promise<void> {
  if (id === get(activeTabId)) return
  const target = get(tabs).find((t) => t.id === id)
  if (!target) return
  captureActiveTabState()
  activeTabId.set(id)
  currentFile.set(target.path)
  dirty.set(target.dirty)

  if (isPdfPath(target.path)) {
    const cached = pdfCache.get(id)
    if (!target.needsReload && cached) {
      pdfDataUrl.set(cached)
      return
    }
    try {
      const dataUrl = await readPdfAsDataUrl(target.path)
      pdfCache.set(id, dataUrl)
      pdfDataUrl.set(dataUrl)
      if (target.needsReload) {
        tabs.update((ts) => ts.map((t) => (t.id === id ? { ...t, needsReload: false } : t)))
        statusMsg.set('Reloaded from disk')
      }
    } catch (e) {
      statusMsg.set(`Could not reload: ${e}`)
    }
    return
  }

  pdfDataUrl.set(null)
  editorScroll.set(target.scrollFraction)
  if (target.needsReload) {
    if (target.dirty) {
      statusMsg.set('File changed on disk — save or discard changes to reload')
    } else {
      try {
        content.set(await readFile(target.path))
        reloadTrigger.update((n) => n + 1)
        statusMsg.set('Reloaded from disk')
      } catch (e) {
        statusMsg.set(`Could not reload: ${e}`)
      }
    }
  }
  // Editor.svelte's own effect (keyed on activeTabId) is responsible for
  // clearing `needsReload` once it has rebuilt that tab's editor state from
  // the fresh content — see its `tabNeedsFreshState` check.
}

/** Close a tab. Picks the right neighbor, then the left neighbor, then no
 *  tab at all, as the next active tab — the conventional tabbed-editor rule. */
export async function closeTab(id: string): Promise<void> {
  const current = get(tabs)
  const idx = current.findIndex((t) => t.id === id)
  if (idx === -1) return
  const remaining = current.filter((t) => t.id !== id)
  tabs.set(remaining)
  pdfCache.delete(id)

  if (get(activeTabId) !== id) return // closed a background tab — active tab unaffected

  if (remaining.length === 0) {
    activeTabId.set(null)
    currentFile.set(null)
    content.set('')
    dirty.set(false)
    editorScroll.set(0)
    pdfDataUrl.set(null)
    return
  }
  const next = current[idx + 1] ?? current[idx - 1]
  // `next` still belongs to `remaining` (it isn't the one we just removed).
  // `captureActiveTabState` (called by switchToTab) harmlessly no-ops here
  // since the just-closed tab's id no longer exists in `tabs`.
  await switchToTab(next.id)
}

/** Mark the tab open on `path` (if any) as needing a reload — called when a
 *  `file-changed` event's path doesn't belong to the active tab. Returns
 *  whether a background tab matched (so the caller can report it). */
export function markBackgroundTabForReload(path: string): boolean {
  const match = get(tabs).find((t) => t.path === path && t.id !== get(activeTabId))
  if (!match) return false
  tabs.update((ts) => ts.map((t) => (t.id === match.id ? { ...t, needsReload: true } : t)))
  return true
}

/** Cycle to the next (or, with `dir: -1`, previous) tab, wrapping around. */
export async function cycleTab(dir: 1 | -1): Promise<void> {
  const ts = get(tabs)
  if (ts.length < 2) return
  const idx = ts.findIndex((t) => t.id === get(activeTabId))
  const next = ts[(idx + dir + ts.length) % ts.length]
  await switchToTab(next.id)
}
