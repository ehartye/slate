import { describe, it, expect, vi, beforeEach } from 'vitest'
import { get } from 'svelte/store'

vi.mock('../src/lib/tauri', async (importOriginal) => {
  const orig = await importOriginal<typeof import('../src/lib/tauri')>()
  return { ...orig, readFile: vi.fn(), readPdfAsDataUrl: vi.fn(), readImageAsDataUrl: vi.fn() }
})

import {
  openTab, switchToTab, closeTab, findTabByPath, markBackgroundTabForReload, cycleTab,
  tabIdsInScope, closeTabsAround,
} from '../src/lib/tabs'
import { readFile, readPdfAsDataUrl, readImageAsDataUrl } from '../src/lib/tauri'
import {
  tabs, activeTabId, currentFile, content, dirty, editorScroll, reloadTrigger, statusMsg,
  pdfDataUrl, imageDataUrl, activeTextForDisk, type Tab,
} from '../src/lib/stores'

const mockRead = vi.mocked(readFile)
const mockReadPdf = vi.mocked(readPdfAsDataUrl)
const mockReadImage = vi.mocked(readImageAsDataUrl)

beforeEach(() => {
  vi.clearAllMocks()
  // `content`/`pdfDataUrl` are views of the active tab's document (stores.ts),
  // so clearing the tabs is what resets them — they have no `set` of their own.
  tabs.set([])
  activeTabId.set(null)
  currentFile.set(null)
  dirty.set(false)
  editorScroll.set(0)
  reloadTrigger.set(0)
  statusMsg.set('')
})

describe('openTab', () => {
  it('creates and activates a new tab, reading the file', async () => {
    mockRead.mockResolvedValue('hello')

    await openTab('/a.md')

    expect(get(tabs).map((t) => t.path)).toEqual(['/a.md'])
    expect(get(activeTabId)).toBe(get(tabs)[0].id)
    expect(get(currentFile)).toBe('/a.md')
    expect(get(content)).toBe('hello')
    expect(get(dirty)).toBe(false)
  })

  it('appends a second tab without disturbing the first', async () => {
    mockRead.mockResolvedValueOnce('one').mockResolvedValueOnce('two')

    await openTab('/a.md')
    await openTab('/b.md')

    expect(get(tabs).map((t) => t.path)).toEqual(['/a.md', '/b.md'])
    expect(get(currentFile)).toBe('/b.md')
    expect(get(content)).toBe('two')
  })

  it('switches to an already-open tab instead of duplicating it', async () => {
    mockRead.mockResolvedValueOnce('one').mockResolvedValueOnce('two')
    await openTab('/a.md')
    await openTab('/b.md')

    await openTab('/a.md')

    expect(get(tabs).length).toBe(2)
    expect(get(currentFile)).toBe('/a.md')
    // `content` for a plain revisit is reconciled by Editor.svelte from its
    // own cached EditorState, not by tabs.ts — so it's intentionally left
    // as-is here rather than asserted against.
  })

  it('reports a read failure via statusMsg without creating a tab', async () => {
    mockRead.mockRejectedValue('boom')

    await openTab('/missing.md')

    expect(get(tabs).length).toBe(0)
    expect(get(statusMsg)).toContain('Could not open file')
  })

  it('captures the outgoing tab\'s dirty/scroll snapshot before switching', async () => {
    mockRead.mockResolvedValueOnce('one').mockResolvedValueOnce('two')
    await openTab('/a.md')
    dirty.set(true)
    editorScroll.set(0.5)

    await openTab('/b.md')

    const tabA = get(tabs).find((t) => t.path === '/a.md')!
    expect(tabA.dirty).toBe(true)
    expect(tabA.scrollFraction).toBe(0.5)
  })
})

describe('switchToTab', () => {
  it('restores the target tab\'s dirty/scroll snapshot', async () => {
    mockRead.mockResolvedValueOnce('one').mockResolvedValueOnce('two')
    await openTab('/a.md')
    dirty.set(true)
    editorScroll.set(0.7)
    await openTab('/b.md') // captures /a.md's snapshot, activates /b.md

    const tabA = get(tabs).find((t) => t.path === '/a.md')!
    await switchToTab(tabA.id)

    expect(get(currentFile)).toBe('/a.md')
    expect(get(dirty)).toBe(true)
    expect(get(editorScroll)).toBe(0.7)
  })

  it('is a no-op when switching to the already-active tab', async () => {
    mockRead.mockResolvedValue('one')
    await openTab('/a.md')
    const id = get(activeTabId)!

    await switchToTab(id)

    expect(get(activeTabId)).toBe(id)
  })

  it('reloads a needs-reload tab from disk when it has no unsaved edits', async () => {
    mockRead.mockResolvedValueOnce('one').mockResolvedValueOnce('two')
    await openTab('/a.md')
    await openTab('/b.md')
    markBackgroundTabForReload('/a.md')
    mockRead.mockResolvedValueOnce('one-updated')

    const tabA = get(tabs).find((t) => t.path === '/a.md')!
    await switchToTab(tabA.id)

    expect(get(content)).toBe('one-updated')
    expect(get(reloadTrigger)).toBe(1)
    expect(get(statusMsg)).toContain('Reloaded')
  })

  it('warns instead of reloading a needs-reload tab that has unsaved edits', async () => {
    mockRead.mockResolvedValueOnce('one').mockResolvedValueOnce('two')
    await openTab('/a.md')
    dirty.set(true)
    await openTab('/b.md')
    markBackgroundTabForReload('/a.md')

    const tabA = get(tabs).find((t) => t.path === '/a.md')!
    await switchToTab(tabA.id)

    expect(get(statusMsg)).toContain('save or discard')
  })

  // Regression: `content` used to be resynced only by Editor.svelte's
  // tab-switch effect, but +page.svelte unmounts the editor pane when it's
  // collapsed (and while a PDF tab is active), so a switch could leave
  // `content` — what Preview renders and save() writes — on the previous tab.
  it('restores the target tab\'s text without any editor involvement', async () => {
    mockRead.mockResolvedValueOnce('one').mockResolvedValueOnce('two')
    await openTab('/a.md')
    await openTab('/b.md')

    const tabA = get(tabs).find((t) => t.path === '/a.md')!
    await switchToTab(tabA.id)

    expect(get(content)).toBe('one')
    expect(mockRead).toHaveBeenCalledTimes(2) // served from cache, not re-read
  })

  it('carries a tab\'s unsaved edits back with it across a switch', async () => {
    mockRead.mockResolvedValueOnce('one').mockResolvedValueOnce('two')
    await openTab('/a.md')
    content.set('one edited')
    dirty.set(true)
    await openTab('/b.md')
    expect(get(content)).toBe('two')

    const tabA = get(tabs).find((t) => t.path === '/a.md')!
    await switchToTab(tabA.id)

    expect(get(content)).toBe('one edited')
    expect(get(dirty)).toBe(true)
  })

  it('restores text when switching back from a pdf tab', async () => {
    mockRead.mockResolvedValueOnce('one')
    mockReadPdf.mockResolvedValue('data:application/pdf;base64,AAA')
    await openTab('/a.md')
    await openTab('/doc.pdf')
    expect(get(content)).toBe('')

    const tabA = get(tabs).find((t) => t.path === '/a.md')!
    await switchToTab(tabA.id)

    expect(get(content)).toBe('one')
    expect(get(pdfDataUrl)).toBe(null)
  })
})

describe('closeTab', () => {
  it('activates the right neighbor when closing the active tab', async () => {
    mockRead.mockResolvedValue('x')
    await openTab('/a.md')
    await openTab('/b.md')
    await openTab('/c.md')
    const [a, b] = get(tabs)
    await switchToTab(a.id) // make /a.md active, with /b.md to its right

    await closeTab(a.id)

    expect(get(tabs).map((t) => t.path)).toEqual(['/b.md', '/c.md'])
    expect(get(currentFile)).toBe('/b.md')
  })

  it('falls back to the left neighbor when closing the last tab', async () => {
    mockRead.mockResolvedValue('x')
    await openTab('/a.md')
    await openTab('/b.md') // active

    await closeTab(get(activeTabId)!)

    expect(get(tabs).map((t) => t.path)).toEqual(['/a.md'])
    expect(get(currentFile)).toBe('/a.md')
  })

  it('clears everything when closing the only tab', async () => {
    mockRead.mockResolvedValue('x')
    await openTab('/a.md')

    await closeTab(get(activeTabId)!)

    expect(get(tabs)).toEqual([])
    expect(get(activeTabId)).toBeNull()
    expect(get(currentFile)).toBeNull()
    expect(get(content)).toBe('')
  })

  it('leaves the active tab untouched when closing a background tab', async () => {
    mockRead.mockResolvedValue('x')
    await openTab('/a.md')
    await openTab('/b.md') // active
    const tabA = get(tabs).find((t) => t.path === '/a.md')!

    await closeTab(tabA.id)

    expect(get(currentFile)).toBe('/b.md')
    expect(get(tabs).map((t) => t.path)).toEqual(['/b.md'])
  })
})

describe('findTabByPath', () => {
  it('finds an open tab by path', async () => {
    mockRead.mockResolvedValue('x')
    await openTab('/a.md')
    expect(findTabByPath('/a.md')?.path).toBe('/a.md')
    expect(findTabByPath('/nope.md')).toBeUndefined()
  })
})

describe('markBackgroundTabForReload', () => {
  it('marks a background tab and returns true', async () => {
    mockRead.mockResolvedValue('x')
    await openTab('/a.md')
    await openTab('/b.md') // active
    const tabA = get(tabs).find((t) => t.path === '/a.md')!

    expect(markBackgroundTabForReload('/a.md')).toBe(true)
    expect(get(tabs).find((t) => t.id === tabA.id)?.needsReload).toBe(true)
  })

  it('returns false when the path belongs to the active tab or no tab', async () => {
    mockRead.mockResolvedValue('x')
    await openTab('/a.md')

    expect(markBackgroundTabForReload('/a.md')).toBe(false) // it's the active tab
    expect(markBackgroundTabForReload('/nope.md')).toBe(false)
  })
})

describe('cycleTab', () => {
  it('cycles forward and wraps around', async () => {
    mockRead.mockResolvedValue('x')
    await openTab('/a.md')
    await openTab('/b.md')
    await openTab('/c.md') // active

    await cycleTab(1)
    expect(get(currentFile)).toBe('/a.md')
  })

  it('cycles backward and wraps around', async () => {
    mockRead.mockResolvedValue('x')
    await openTab('/a.md') // will become active again after wrap
    await openTab('/b.md')
    await switchToTab(get(tabs)[0].id) // back to /a.md

    await cycleTab(-1)
    expect(get(currentFile)).toBe('/b.md')
  })

  it('is a no-op with fewer than two tabs', async () => {
    mockRead.mockResolvedValue('x')
    await openTab('/a.md')

    await cycleTab(1)

    expect(get(currentFile)).toBe('/a.md')
  })
})

describe('PDF tabs', () => {
  it('opens a pdf via readPdfAsDataUrl, not readFile, and leaves content empty', async () => {
    mockReadPdf.mockResolvedValue('data:application/pdf;base64,AAA')

    await openTab('/report.pdf')

    expect(mockReadPdf).toHaveBeenCalledWith('/report.pdf')
    expect(mockRead).not.toHaveBeenCalled()
    expect(get(currentFile)).toBe('/report.pdf')
    expect(get(content)).toBe('')
    expect(get(dirty)).toBe(false)
    expect(get(pdfDataUrl)).toBe('data:application/pdf;base64,AAA')
  })

  it('reports a read failure via statusMsg without creating a tab', async () => {
    mockReadPdf.mockRejectedValue('boom')

    await openTab('/broken.pdf')

    expect(get(tabs).length).toBe(0)
    expect(get(statusMsg)).toContain('Could not open file')
  })

  it('clears pdfDataUrl when opening a text tab after a pdf tab', async () => {
    mockReadPdf.mockResolvedValue('data:application/pdf;base64,AAA')
    await openTab('/report.pdf')
    expect(get(pdfDataUrl)).not.toBeNull()

    mockRead.mockResolvedValue('# hello')
    await openTab('/notes.md')

    expect(get(pdfDataUrl)).toBeNull()
  })

  it('sets pdfDataUrl (and clears it for text) when switching tabs back and forth', async () => {
    mockRead.mockResolvedValue('# hello')
    mockReadPdf.mockResolvedValue('data:application/pdf;base64,AAA')
    await openTab('/notes.md')
    await openTab('/report.pdf') // active

    const notesTab = get(tabs).find((t) => t.path === '/notes.md')!
    await switchToTab(notesTab.id)
    // content for a plain revisit is reconciled by Editor.svelte from its own
    // cached EditorState, not by tabs.ts (same nuance as the plain-tab tests
    // above) — what tabs.ts itself guarantees is that pdfDataUrl is cleared.
    expect(get(pdfDataUrl)).toBeNull()

    const pdfTab = get(tabs).find((t) => t.path === '/report.pdf')!
    await switchToTab(pdfTab.id)
    expect(get(pdfDataUrl)).toBe('data:application/pdf;base64,AAA')
  })

  it('does not re-fetch a cached pdf on a plain (non-reload) tab switch', async () => {
    mockReadPdf.mockResolvedValue('data:application/pdf;base64,AAA')
    mockRead.mockResolvedValue('# hello')
    await openTab('/report.pdf')
    await openTab('/notes.md') // active, pdf now a background tab
    mockReadPdf.mockClear()

    const pdfTab = get(tabs).find((t) => t.path === '/report.pdf')!
    await switchToTab(pdfTab.id)

    expect(mockReadPdf).not.toHaveBeenCalled()
    expect(get(pdfDataUrl)).toBe('data:application/pdf;base64,AAA')
  })

  it('re-fetches and clears needsReload when switching into a pdf tab flagged for reload', async () => {
    mockReadPdf.mockResolvedValue('data:application/pdf;base64,OLD')
    mockRead.mockResolvedValue('# hello')
    await openTab('/report.pdf')
    await openTab('/notes.md') // active, pdf now a background tab
    markBackgroundTabForReload('/report.pdf')
    mockReadPdf.mockResolvedValue('data:application/pdf;base64,NEW')

    const pdfTab = get(tabs).find((t) => t.path === '/report.pdf')!
    await switchToTab(pdfTab.id)

    expect(get(pdfDataUrl)).toBe('data:application/pdf;base64,NEW')
    expect(get(tabs).find((t) => t.id === pdfTab.id)?.needsReload).toBe(false)
    expect(get(statusMsg)).toContain('Reloaded from disk')
  })

  it('never calls readFile for a pdf path (would error on binary content)', async () => {
    mockReadPdf.mockResolvedValue('data:application/pdf;base64,AAA')
    mockRead.mockResolvedValue('# hello')
    await openTab('/notes.md')
    await openTab('/report.pdf')
    await switchToTab(get(tabs).find((t) => t.path === '/notes.md')!.id)
    await switchToTab(get(tabs).find((t) => t.path === '/report.pdf')!.id)

    expect(mockRead).not.toHaveBeenCalledWith('/report.pdf')
  })

  it('clears pdfDataUrl and evicts the cache entry when closing the only (pdf) tab', async () => {
    mockReadPdf.mockResolvedValue('data:application/pdf;base64,AAA')
    await openTab('/report.pdf')

    await closeTab(get(activeTabId)!)

    expect(get(tabs)).toEqual([])
    expect(get(pdfDataUrl)).toBeNull()
  })
})

// `content` and `pdfDataUrl` are views of the *active* tab's document rather
// than free-floating buffers (see stores.ts). These pin down the properties
// that arrangement exists to guarantee — the ones that made a whole class of
// "the store is showing some other tab's document" bug possible before, up to
// and including save() writing one tab's text into another tab's file.
describe('content is scoped to the active tab', () => {
  it('routes an edit to the active tab, leaving background tabs untouched', async () => {
    mockRead.mockResolvedValueOnce('one').mockResolvedValueOnce('two')
    await openTab('/a.md')
    await openTab('/b.md')

    content.set('two edited')

    const tabA = get(tabs).find((t) => t.path === '/a.md')!
    await switchToTab(tabA.id)
    expect(get(content)).toBe('one')

    await switchToTab(get(tabs).find((t) => t.path === '/b.md')!.id)
    expect(get(content)).toBe('two edited')
    expect(mockRead).toHaveBeenCalledTimes(2) // neither switch re-read from disk
  })

  it('ignores a write when no tab is open', () => {
    content.set('orphan text')

    expect(get(content)).toBe('')
  })

  it('refuses to overwrite a pdf tab\'s document with text', async () => {
    mockReadPdf.mockResolvedValue('data:application/pdf;base64,AAA')
    await openTab('/report.pdf')

    content.set('not a pdf')

    expect(get(pdfDataUrl)).toBe('data:application/pdf;base64,AAA')
    expect(get(content)).toBe('')
  })

  it('empties itself when the last tab closes', async () => {
    mockRead.mockResolvedValue('one')
    await openTab('/a.md')
    expect(get(content)).toBe('one')

    await closeTab(get(activeTabId)!)

    expect(get(content)).toBe('')
  })
})

describe('image tabs', () => {
  it('opens an image through the image reader, not readFile', async () => {
    mockReadImage.mockResolvedValue('data:image/png;base64,AAAA')

    await openTab('/pics/shot.png')

    expect(mockReadImage).toHaveBeenCalledWith('/pics/shot.png')
    expect(mockRead).not.toHaveBeenCalled()
    expect(get(imageDataUrl)).toBe('data:image/png;base64,AAAA')
    // An image tab has no text behind it, so `content` stays empty — this is
    // what keeps a base64 blob out of the markdown pipeline and out of save().
    expect(get(content)).toBe('')
    expect(get(pdfDataUrl)).toBeNull()
  })

  it("keeps each tab's document separate across a switch", async () => {
    mockRead.mockResolvedValue('# notes')
    mockReadImage.mockResolvedValue('data:image/png;base64,BBBB')

    await openTab('/a.md')
    const textTab = get(activeTabId)!
    await openTab('/pics/shot.png')

    expect(get(imageDataUrl)).toBe('data:image/png;base64,BBBB')
    expect(get(content)).toBe('')

    await switchToTab(textTab)

    // Switching back restores the text and drops the image view — the stores
    // are views of the active tab, so neither can linger.
    expect(get(content)).toBe('# notes')
    expect(get(imageDataUrl)).toBeNull()
  })

  it('reports a failed image read without opening a broken tab', async () => {
    mockReadImage.mockRejectedValue('not an image file')

    await openTab('/pics/bad.png')

    expect(get(tabs)).toEqual([])
    expect(get(statusMsg)).toContain('Could not open file')
  })
})

const paths = () => get(tabs).map((t) => t.path)
const idOf = (path: string) => get(tabs).find((t) => t.path === path)!.id

async function openFive() {
  mockRead.mockImplementation(async (p: string) => `text of ${p}`)
  for (const p of ['/a.md', '/b.md', '/c.md', '/d.md', '/e.md']) await openTab(p)
}

describe('tabIdsInScope', () => {
  const list = ['a', 'b', 'c'].map((id) => ({ id, path: `/${id}`, dirty: false, scrollFraction: 0, needsReload: false })) as Tab[]

  it('reaches the tabs on the chosen side, never the anchor', () => {
    expect(tabIdsInScope(list, 'b', 'right')).toEqual(['c'])
    expect(tabIdsInScope(list, 'b', 'left')).toEqual(['a'])
    expect(tabIdsInScope(list, 'b', 'others')).toEqual(['a', 'c'])
  })

  it('reaches nothing past either end, or for an unknown anchor', () => {
    expect(tabIdsInScope(list, 'c', 'right')).toEqual([])
    expect(tabIdsInScope(list, 'a', 'left')).toEqual([])
    expect(tabIdsInScope(list, 'zzz', 'others')).toEqual([])
  })
})

describe('closeTabsAround', () => {
  it('closes the tabs to the right of the right-clicked tab', async () => {
    await openFive()
    await closeTabsAround(idOf('/b.md'), 'right')
    expect(paths()).toEqual(['/a.md', '/b.md'])
  })

  it('closes the tabs to the left of the right-clicked tab', async () => {
    await openFive()
    await closeTabsAround(idOf('/d.md'), 'left')
    expect(paths()).toEqual(['/d.md', '/e.md'])
    expect(get(currentFile)).toBe('/e.md') // active tab survived, so it stays active
  })

  it('closes every other tab', async () => {
    await openFive()
    await closeTabsAround(idOf('/c.md'), 'others')
    expect(paths()).toEqual(['/c.md'])
  })

  it('activates the right-clicked tab when the active one is closed', async () => {
    await openFive() // /e.md is active
    await closeTabsAround(idOf('/b.md'), 'right')
    expect(get(currentFile)).toBe('/b.md')
    expect(get(content)).toBe('text of /b.md')
    expect(get(activeTabId)).toBe(idOf('/b.md'))
  })

  it('keeps tabs with unsaved changes open — including the active one', async () => {
    await openFive()
    await switchToTab(idOf('/c.md'))
    content.set('edited c')
    dirty.set(true) // the active tab's dirty flag lives only in the store so far
    await switchToTab(idOf('/e.md'))
    content.set('edited e')
    dirty.set(true)

    await closeTabsAround(idOf('/a.md'), 'others')

    expect(paths()).toEqual(['/a.md', '/c.md', '/e.md'])
    expect(get(currentFile)).toBe('/e.md')
    expect(get(content)).toBe('edited e')
    expect(get(statusMsg)).toBe('Kept 2 tabs with unsaved changes open')
  })

  it('does nothing when there is nothing on that side', async () => {
    await openFive()
    await closeTabsAround(idOf('/e.md'), 'right')
    expect(paths()).toEqual(['/a.md', '/b.md', '/c.md', '/d.md', '/e.md'])
    expect(get(statusMsg)).toBe('')
  })
})

describe('line endings', () => {
  it('normalizes a CRLF file for the app and restores CRLF for disk', async () => {
    mockRead.mockResolvedValue('one\r\ntwo\r\n')
    await openTab('/a.bat')

    expect(get(content)).toBe('one\ntwo\n')
    content.set('one\ntwo\nthree\n') // an edit, as the editor reports it
    expect(activeTextForDisk()).toBe('one\r\ntwo\r\nthree\r\n')
  })

  it('leaves an LF file as LF', async () => {
    mockRead.mockResolvedValue('one\ntwo\n')
    await openTab('/a.py')
    content.set('one\ntwo\nthree\n')
    expect(activeTextForDisk()).toBe('one\ntwo\nthree\n')
  })

  it('re-detects the line ending when the file is reloaded from disk', async () => {
    mockRead.mockResolvedValue('one\r\ntwo\r\n')
    await openTab('/a.txt')
    content.load('one\ntwo\n') // converted to LF by another program
    expect(activeTextForDisk()).toBe('one\ntwo\n')
  })

  it('has nothing to write for a pdf tab', async () => {
    mockReadPdf.mockResolvedValue('data:application/pdf;base64,AAA')
    await openTab('/report.pdf')
    expect(activeTextForDisk()).toBeNull()
  })
})
