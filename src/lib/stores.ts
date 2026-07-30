import { writable, derived, get, type Readable } from 'svelte/store'
import type { Theme } from './theme'

export const currentFolder = writable<string | null>(null)
export const files = writable<string[]>([])          // full paths
export const folders = writable<string[]>([])         // subfolders of currentFolder, full paths

/** One open tab. This is the tab's *metadata* — its document lives in
 *  `tabDocs` below, keyed by id. `dirty`/`editorScroll` mirror whichever tab
 *  is active; see tabs.ts for the open/switch/close logic that snapshots them
 *  back into a tab as it's switched away from. */
export interface Tab {
  id: string
  path: string
  dirty: boolean
  scrollFraction: number   // last editor scroll fraction, restored on reactivation
  needsReload: boolean     // an external file-changed event arrived while this tab was inactive
}
export const tabs = writable<Tab[]>([])
export const activeTabId = writable<string | null>(null)

/** An open tab's loaded document. Text and PDF are separate variants rather
 *  than one nullable blob: a PDF isn't text and can't be edited, and keeping
 *  them apart is what stops anything reading `content` (Preview's markdown
 *  pipeline, Save, "Open in browser") from ever having to guard against it
 *  holding a large base64 blob. */
export type TabDoc =
  | { kind: 'text'; text: string }
  | { kind: 'pdf'; dataUrl: string }

/** Every open tab's document, keyed by tab id — the single source of truth for
 *  document bytes, and the reason `content` below can't drift out of sync with
 *  the active tab.
 *
 *  Module-private on purpose: writes go through the helpers below (or
 *  `content.set`), all of which are tab-scoped, so there is no way to write a
 *  document without saying which tab it belongs to.
 *
 *  Documents are keyed by id here rather than stored on the `Tab` records
 *  because `tabs` is UI metadata that TabBar renders; putting text there would
 *  invalidate the tab strip on every keystroke. */
const tabDocs = writable(new Map<string, TabDoc>())

/** The active tab's document, or undefined when no tab is active. */
const activeDoc = derived([tabDocs, activeTabId], ([$docs, $id]) => ($id ? $docs.get($id) : undefined))

/** Mutate the doc map in place — the map identity never changes, so this is
 *  O(1) per keystroke rather than copying the whole map. */
function mutateDocs(fn: (docs: Map<string, TabDoc>) => void): void {
  tabDocs.update((docs) => {
    fn(docs)
    return docs
  })
}

export function setTabText(id: string, text: string): void {
  mutateDocs((docs) => { docs.set(id, { kind: 'text', text }) })
}

export function setTabPdf(id: string, dataUrl: string): void {
  mutateDocs((docs) => { docs.set(id, { kind: 'pdf', dataUrl }) })
}

/** Forget a closed tab's document, so closing tabs doesn't leak them. */
export function dropTabDoc(id: string): void {
  mutateDocs((docs) => { docs.delete(id) })
}

/** Whether this tab's document has been loaded yet. */
export function hasTabDoc(id: string): boolean {
  return get(tabDocs).has(id)
}

export const currentFile = writable<string | null>(null)

/** The active tab's text — a *view* of that tab's entry in `tabDocs`, not
 *  storage of its own. Reads ('' for a PDF tab, or none open) and writes are
 *  both scoped to whichever tab is active, so the store can't end up holding
 *  one tab's text while another tab is on screen. That used to be possible,
 *  and since `content` is what save() writes to disk, it could put one tab's
 *  text into another tab's file. */
export const content: Readable<string> & { set(text: string): void } = {
  subscribe: derived(activeDoc, (doc) => (doc?.kind === 'text' ? doc.text : '')).subscribe,
  set(text: string) {
    const id = get(activeTabId)
    if (!id) return // nothing open — a text write has no tab to belong to
    if (get(tabDocs).get(id)?.kind === 'pdf') return // never clobber a PDF doc
    setTabText(id, text)
  },
}

/** The active tab's PDF content as a `data:` URL, or null when the active tab
 *  isn't a PDF. Same view-of-`tabDocs` arrangement as `content` above. */
export const pdfDataUrl: Readable<string | null> = derived(
  activeDoc,
  (doc) => (doc?.kind === 'pdf' ? doc.dataUrl : null),
)

export const dirty = writable<boolean>(false)
export const reloadTrigger = writable<number>(0)  // bumped on external file reload
export const statusMsg = writable<string>('')         // transient errors/info
export const editorScroll = writable<number>(0)       // 0..1 scroll fraction, for preview sync
export const previewZoom = writable<number>(1)        // preview render scale, persisted

// File-browser filters, persisted
export const mdOnlyMode = writable<boolean>(true)      // false: browse any text file, not just .md
export const showHiddenFiles = writable<boolean>(false) // true: include dotfiles/dot-dirs

// Layout collapse state
export const sidebarCollapsed = writable<boolean>(false)
export const sidebarWidth = writable<number>(220)     // file browser panel width, persisted
export const editorCollapsed = writable<boolean>(false)
export const previewCollapsed = writable<boolean>(false)

// Theme state
export const themes = writable<Theme[]>([])
export const activeThemeName = writable<string | null>(null) // active family
export const activeMode = writable<'light' | 'dark'>('dark')
// Mermaid base mode, derived from the active theme's mode.
export const activeMermaidMode = writable<'default' | 'dark'>('dark')

// In-document find (Ctrl/Cmd+F), scoped to the rendered Preview pane.
export const findOpen = writable<boolean>(false)
export const findQuery = writable<string>('')
export const findActiveIndex = writable<number>(0)
export const findMatchCount = writable<number>(0)

