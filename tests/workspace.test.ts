import { describe, it, expect, vi, beforeEach } from 'vitest'
import { get } from 'svelte/store'

vi.mock('../src/lib/tauri', async (importOriginal) => {
  const orig = await importOriginal<typeof import('../src/lib/tauri')>()
  return { ...orig, listMarkdownFiles: vi.fn(), readFile: vi.fn() }
})

import { loadFile, refreshWorkspace } from '../src/lib/workspace'
import { listMarkdownFiles, readFile } from '../src/lib/tauri'
import {
  content, currentFile, currentFolder, files, dirty, statusMsg, reloadTrigger,
} from '../src/lib/stores'

const mockList = vi.mocked(listMarkdownFiles)
const mockRead = vi.mocked(readFile)

beforeEach(() => {
  vi.clearAllMocks()
  content.set('')
  currentFile.set(null)
  currentFolder.set(null)
  files.set([])
  dirty.set(false)
  statusMsg.set('')
  reloadTrigger.set(0)
})

describe('loadFile', () => {
  it('loads the parent folder and opens the file', async () => {
    mockList.mockResolvedValue(['C:\\docs\\a.md', 'C:\\docs\\b.md'])
    mockRead.mockResolvedValue('# hello')

    await loadFile('C:\\docs\\b.md')

    expect(get(currentFolder)).toBe('C:\\docs')
    expect(get(files)).toEqual(['C:\\docs\\a.md', 'C:\\docs\\b.md'])
    expect(get(content)).toBe('# hello')
    expect(get(currentFile)).toBe('C:\\docs\\b.md')
    expect(get(dirty)).toBe(false)
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
