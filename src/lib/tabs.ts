// Tab lifecycle: open/switch/close. Each tab remembers its own dirty state
// and scroll fraction; the CodeMirror EditorState per tab is cached inside
// Editor.svelte (the only place that needs it), and swapped in via
// `view.setState(...)` when `activeTabId` changes — the idiomatic CodeMirror 6
// pattern for one editor view backing several open documents. That cache is
// only ever a cache: Editor.svelte validates it against the tab's document
// and rebuilds when they disagree, so it can't be the reason a stale document
// stays on screen.
//
// A tab's actual document — text or PDF — belongs to `tabDocs` in stores.ts,
// keyed by tab id, and the `content`/`pdfDataUrl` stores are views of
// *whichever tab is active*. That's why nothing below has to explicitly push
// a document into a store when switching tabs: setting `activeTabId` is the
// swap. It used to be an extra step, and one that Editor.svelte performed —
// which broke whenever the editor pane wasn't mounted (collapsed, or a PDF
// tab active), leaving `content` — what Preview renders and save() writes —
// pointing at the *previous* tab.
import { get } from 'svelte/store'
import {
  tabs, activeTabId, currentFile, dirty, editorScroll, reloadTrigger, statusMsg,
  setTabText, setTabPdf, dropTabDoc, hasTabDoc, type Tab,
} from './stores'
import { readFile, readPdfAsDataUrl } from './tauri'
import { isPdfPath } from './fileKind'

let counter = 0
/** A unique-enough id for the lifetime of the app; tabs aren't persisted. */
function nextTabId(): string {
  counter += 1
  return `tab-${counter}`
}

/** The currently open tab with this path, if any. */
export function findTabByPath(path: string): Tab | undefined {
  return get(tabs).find((t) => t.path === path)
}

/** Snapshot the active tab's live values back into its tabs-array entry —
 *  call this before switching away from it so nothing is lost. (Its document
 *  needs no snapshotting: edits are written straight to the tab's own entry
 *  in `tabDocs` as they happen.) */
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
    // The document goes in before the tab is activated, so `pdfDataUrl` is
    // never briefly empty for a tab that in fact has content.
    setTabPdf(tab.id, dataUrl)
    tabs.update((ts) => [...ts, tab])
    activeTabId.set(tab.id)
    currentFile.set(path)
    dirty.set(false)
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
  setTabText(tab.id, text)
  tabs.update((ts) => [...ts, tab])
  activeTabId.set(tab.id)
  currentFile.set(path)
  dirty.set(false)
  editorScroll.set(0)
}

/** Switch to an already-open tab by id. Restores its dirty/scroll snapshot;
 *  if the file changed on disk while this tab was inactive (and it has no
 *  unsaved edits), reloads it from disk now. */
export async function switchToTab(id: string): Promise<void> {
  if (id === get(activeTabId)) return
  const target = get(tabs).find((t) => t.id === id)
  if (!target) return
  const isPdf = isPdfPath(target.path)

  captureActiveTabState()
  // This *is* the document swap: `content` and `pdfDataUrl` are views of the
  // active tab's entry in `tabDocs`, so there's no second "…and now push the
  // document into a store" step that could be skipped or done by a component
  // that happens not to be mounted.
  activeTabId.set(id)
  currentFile.set(target.path)
  dirty.set(target.dirty)
  if (!isPdf) editorScroll.set(target.scrollFraction)

  // Defensively treat a missing document like a stale one: falling through
  // with nothing loaded would show (and, for a text tab, let save() write) an
  // empty document.
  const stale = target.needsReload || !hasTabDoc(id)
  if (!stale) return
  if (target.needsReload && target.dirty) {
    statusMsg.set('File changed on disk — save or discard changes to reload')
    return
  }

  try {
    if (isPdf) {
      setTabPdf(id, await readPdfAsDataUrl(target.path))
    } else {
      setTabText(id, await readFile(target.path))
      // Editor.svelte may already have built this tab's editor state from the
      // pre-reload text while the read was in flight; the trigger makes it
      // resync from what's now on disk.
      reloadTrigger.update((n) => n + 1)
    }
    if (target.needsReload) {
      tabs.update((ts) => ts.map((t) => (t.id === id ? { ...t, needsReload: false } : t)))
      statusMsg.set('Reloaded from disk')
    }
  } catch (e) {
    statusMsg.set(`Could not reload: ${e}`)
  }
}

/** Close a tab. Picks the right neighbor, then the left neighbor, then no
 *  tab at all, as the next active tab — the conventional tabbed-editor rule. */
export async function closeTab(id: string): Promise<void> {
  const current = get(tabs)
  const idx = current.findIndex((t) => t.id === id)
  if (idx === -1) return
  const remaining = current.filter((t) => t.id !== id)
  tabs.set(remaining)
  dropTabDoc(id)

  if (get(activeTabId) !== id) return // closed a background tab — active tab unaffected

  if (remaining.length === 0) {
    activeTabId.set(null)
    currentFile.set(null)
    dirty.set(false)
    editorScroll.set(0)
    // `content`/`pdfDataUrl` empty themselves — with no active tab there's no
    // document for them to be a view of.
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
