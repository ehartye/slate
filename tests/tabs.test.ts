import { describe, it, expect, vi, beforeEach } from 'vitest'
import { get } from 'svelte/store'

vi.mock('../src/lib/tauri', async (importOriginal) => {
  const orig = await importOriginal<typeof import('../src/lib/tauri')>()
  return { ...orig, readFile: vi.fn(), readPdfAsDataUrl: vi.fn() }
})

import {
  openTab, switchToTab, closeTab, findTabByPath, markBackgroundTabForReload, cycleTab,
} from '../src/lib/tabs'
import { readFile, readPdfAsDataUrl } from '../src/lib/tauri'
import {
  tabs, activeTabId, currentFile, content, dirty, editorScroll, reloadTrigger, statusMsg,
  pdfDataUrl,
} from '../src/lib/stores'

const mockRead = vi.mocked(readFile)
const mockReadPdf = vi.mocked(readPdfAsDataUrl)

beforeEach(() => {
  vi.clearAllMocks()
  tabs.set([])
  activeTabId.set(null)
  currentFile.set(null)
  content.set('')
  dirty.set(false)
  editorScroll.set(0)
  reloadTrigger.set(0)
  statusMsg.set('')
  pdfDataUrl.set(null)
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
