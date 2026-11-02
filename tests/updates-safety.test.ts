import { beforeEach, expect, it, vi } from 'vitest'
import { get } from 'svelte/store'
import { activeTabId, tabs, dirty, content, setTabText, currentFile, currentFolder } from '../src/lib/stores'
import { freezeForUpdate, releaseUpdateFreeze, safetySnapshot, saveActiveDocument, mutationsFrozen } from '../src/lib/updateSafety'
vi.mock('../src/lib/tauri', async importOriginal => ({ ...await importOriginal<typeof import('../src/lib/tauri')>(), readFile: vi.fn(), listMarkdownFiles: vi.fn(async () => []), listSubfolders: vi.fn(async () => []) }))
import { readFile } from '../src/lib/tauri'
import { openTab, closeTab } from '../src/lib/tabs'
import { refreshWorkspace } from '../src/lib/workspace'

beforeEach(() => { releaseUpdateFreeze(); tabs.set([{ id: 'a', path: 'a.md', dirty: false, scrollFraction: 0, needsReload: false }]); activeTabId.set('a'); setTabText('a', 'old'); dirty.set(true) })
it('freezes before measuring live and background dirtiness', () => {
  freezeForUpdate(7); expect(mutationsFrozen()).toBe(true); expect(safetySnapshot().dirty).toBe(true)
  content.set('blocked'); expect(get(content)).toBe('old')
  releaseUpdateFreeze(6); expect(mutationsFrozen()).toBe(true)
  releaseUpdateFreeze(7); dirty.set(false)
  tabs.update(ts => [...ts, { id: 'b', path: 'b.md', dirty: true, scrollFraction: 0, needsReload: false }])
  expect(safetySnapshot().dirty).toBe(true)
})
it('pending writes block installation and newer edits stay dirty', async () => {
  let finish!: () => void
  const write = vi.fn(() => new Promise<void>(r => { finish = r }))
  const saved = saveActiveDocument(write)
  expect(safetySnapshot().pendingWrites).toBe(1)
  content.set('newer'); finish(); await saved
  expect(get(dirty)).toBe(true); expect(safetySnapshot().pendingWrites).toBe(0)
})
it('save completion clears only the saved tab, including inactive snapshots', async () => {
  let finish!: () => void
  const saved = saveActiveDocument(() => new Promise<void>(r => { finish = r }))
  tabs.update(ts => [...ts.map(t => ({ ...t, dirty: true })), { id: 'b', path: 'b.md', dirty: true, scrollFraction: 0, needsReload: false }])
  activeTabId.set('b'); setTabText('b', 'b'); dirty.set(true)
  finish(); await saved
  expect(get(dirty)).toBe(true); expect(get(tabs)[0].dirty).toBe(false)
})
it('refuses saves while frozen', async () => {
  freezeForUpdate(1); const write = vi.fn()
  await expect(saveActiveDocument(write)).rejects.toThrow(/update/i); expect(write).not.toHaveBeenCalled()
})
it('ignores late prepare delivery after its release', () => {
  releaseUpdateFreeze(12)
  freezeForUpdate(12)
  expect(mutationsFrozen()).toBe(false)
  freezeForUpdate(13)
  releaseUpdateFreeze(12)
  expect(mutationsFrozen()).toBe(true)
})
it('blocks close and an in-flight open completion while frozen', async () => {
  let finish!: (text: string) => void
  vi.mocked(readFile).mockImplementation(() => new Promise(r => { finish = r }))
  const opened = openTab('new.md')
  freezeForUpdate(1); finish('new'); await opened; await closeTab('a')
  expect(get(tabs).map(t => t.id)).toEqual(['a'])
})
it('manual refresh cannot erase an edit made while its read is pending', async () => {
  currentFile.set('a.md'); currentFolder.set('.')
  let finish!: (text: string) => void
  vi.mocked(readFile).mockImplementation(() => new Promise(r => { finish = r }))
  const refreshed = refreshWorkspace()
  await vi.waitFor(() => expect(finish).toBeDefined())
  content.set('new edit'); dirty.set(true); finish('disk'); await refreshed
  expect(get(content)).toBe('new edit'); expect(get(dirty)).toBe(true)
})
