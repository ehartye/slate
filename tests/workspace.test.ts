import { describe, it, expect, vi, beforeEach } from 'vitest'
import { get } from 'svelte/store'

vi.mock('../src/lib/tauri', async (importOriginal) => {
  const orig = await importOriginal<typeof import('../src/lib/tauri')>()
  return {
    ...orig,
    listMarkdownFiles: vi.fn(), listTextFiles: vi.fn(), listSubfolders: vi.fn(), readFile: vi.fn(),
  }
})

import { loadFile, refreshWorkspace, browseFolder, folderUp, relistCurrentFolder } from '../src/lib/workspace'
import { listMarkdownFiles, listTextFiles, listSubfolders, readFile } from '../src/lib/tauri'
import {
  content, currentFile, currentFolder, files, folders, dirty, statusMsg, reloadTrigger,
  mdOnlyMode, showHiddenFiles, tabs, activeTabId,
} from '../src/lib/stores'

const mockList = vi.mocked(listMarkdownFiles)
const mockTextList = vi.mocked(listTextFiles)
const mockSubfolders = vi.mocked(listSubfolders)
const mockRead = vi.mocked(readFile)

beforeEach(() => {
  vi.clearAllMocks()
  mockSubfolders.mockResolvedValue([])
  mockTextList.mockResolvedValue([])
  content.set('')
  currentFile.set(null)
  currentFolder.set(null)
  files.set([])
  folders.set([])
  dirty.set(false)
  statusMsg.set('')
  reloadTrigger.set(0)
  mdOnlyMode.set(true)
  showHiddenFiles.set(false)
  tabs.set([])
  activeTabId.set(null)
})

describe('loadFile', () => {
  it('loads the parent folder and opens the file as a new tab', async () => {
    mockList.mockResolvedValue(['C:\\docs\\a.md', 'C:\\docs\\b.md'])
    mockSubfolders.mockResolvedValue(['C:\\docs\\sub'])
    mockRead.mockResolvedValue('# hello')

    await loadFile('C:\\docs\\b.md')

    expect(get(currentFolder)).toBe('C:\\docs')
    expect(get(files)).toEqual(['C:\\docs\\a.md', 'C:\\docs\\b.md'])
    expect(get(folders)).toEqual(['C:\\docs\\sub'])
    expect(get(content)).toBe('# hello')
    expect(get(currentFile)).toBe('C:\\docs\\b.md')
    expect(get(dirty)).toBe(false)
    expect(get(tabs).map((t) => t.path)).toEqual(['C:\\docs\\b.md'])
    expect(get(activeTabId)).toBe(get(tabs)[0].id)
  })

  it('surfaces a read failure via statusMsg', async () => {
    mockList.mockResolvedValue([])
    mockRead.mockRejectedValue('nope')

    await loadFile('C:\\docs\\gone.md')

    expect(get(statusMsg)).toContain('Could not open file')
  })
})

describe('refreshWorkspace', () => {
  it('re-lists the folder and reloads the open file, discarding edits', async () => {
    currentFolder.set('C:\\docs')
    currentFile.set('C:\\docs\\a.md')
    content.set('unsaved edits')
    dirty.set(true)
    mockList.mockResolvedValue(['C:\\docs\\a.md', 'C:\\docs\\new.md'])
    mockRead.mockResolvedValue('from disk')

    await refreshWorkspace()

    expect(get(files)).toEqual(['C:\\docs\\a.md', 'C:\\docs\\new.md'])
    expect(get(content)).toBe('from disk')
    expect(get(dirty)).toBe(false)
    expect(get(reloadTrigger)).toBe(1)
  })

  it('refreshes only the list when no file is open', async () => {
    currentFolder.set('C:\\docs')
    mockList.mockResolvedValue(['C:\\docs\\a.md'])

    await refreshWorkspace()

    expect(get(files)).toEqual(['C:\\docs\\a.md'])
    expect(mockRead).not.toHaveBeenCalled()
  })

  it('is a no-op with a hint when no folder is chosen', async () => {
    await refreshWorkspace()

    expect(mockList).not.toHaveBeenCalled()
    expect(get(statusMsg)).toContain('folder')
  })
})

describe('browseFolder', () => {
  it('navigates into a folder and lists its files/subfolders without touching the open file', async () => {
    currentFile.set('C:\\docs\\open.md')
    content.set('unchanged')
    mockList.mockResolvedValue(['C:\\docs\\sub\\a.md'])
    mockSubfolders.mockResolvedValue(['C:\\docs\\sub\\deeper'])

    await browseFolder('C:\\docs\\sub')

    expect(get(currentFolder)).toBe('C:\\docs\\sub')
    expect(get(files)).toEqual(['C:\\docs\\sub\\a.md'])
    expect(get(folders)).toEqual(['C:\\docs\\sub\\deeper'])
    // Browsing is navigation only — the open file/content are untouched.
    expect(get(currentFile)).toBe('C:\\docs\\open.md')
    expect(get(content)).toBe('unchanged')
  })

  it('surfaces a listing failure via statusMsg', async () => {
    mockList.mockRejectedValue('nope')

    await browseFolder('C:\\docs\\sub')

    expect(get(statusMsg)).toContain('Could not list folder')
  })
})

describe('folderUp', () => {
  it('navigates to the parent of the current folder', async () => {
    currentFolder.set('C:\\docs\\sub')
    mockList.mockResolvedValue(['C:\\docs\\a.md'])
    mockSubfolders.mockResolvedValue(['C:\\docs\\sub'])

    await folderUp()

    expect(get(currentFolder)).toBe('C:\\docs')
    expect(get(files)).toEqual(['C:\\docs\\a.md'])
    expect(get(folders)).toEqual(['C:\\docs\\sub'])
  })

  it('is a no-op when no folder is set', async () => {
    await folderUp()

    expect(mockList).not.toHaveBeenCalled()
  })

  it('is a no-op when the current folder has no parent', async () => {
    currentFolder.set('/')

    await folderUp()

    expect(mockList).not.toHaveBeenCalled()
  })
})

describe('listWorkspace mode-awareness (via browseFolder)', () => {
  it('uses listMarkdownFiles when mdOnlyMode is on (default)', async () => {
    mockList.mockResolvedValue(['/docs/a.md'])

    await browseFolder('/docs')

    expect(mockList).toHaveBeenCalledWith('/docs', false)
    expect(mockTextList).not.toHaveBeenCalled()
    expect(get(files)).toEqual(['/docs/a.md'])
  })

  it('uses listTextFiles when mdOnlyMode is off', async () => {
    mdOnlyMode.set(false)
    mockTextList.mockResolvedValue(['/docs/a.md', '/docs/main.rs'])

    await browseFolder('/docs')

    expect(mockTextList).toHaveBeenCalledWith('/docs', false)
    expect(mockList).not.toHaveBeenCalled()
    expect(get(files)).toEqual(['/docs/a.md', '/docs/main.rs'])
  })

  it('passes showHiddenFiles through to both listings', async () => {
    showHiddenFiles.set(true)
    mockList.mockResolvedValue([])

    await browseFolder('/docs')

    expect(mockList).toHaveBeenCalledWith('/docs', true)
    expect(mockSubfolders).toHaveBeenCalledWith('/docs', true)
  })
})

describe('relistCurrentFolder', () => {
  it('re-lists the current folder', async () => {
    currentFolder.set('/docs')
    mockList.mockResolvedValue(['/docs/a.md'])

    await relistCurrentFolder()

    expect(get(files)).toEqual(['/docs/a.md'])
  })

  it('is a no-op when no folder is set', async () => {
    await relistCurrentFolder()

    expect(mockList).not.toHaveBeenCalled()
  })
})

