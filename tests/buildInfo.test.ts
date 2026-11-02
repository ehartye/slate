import { afterEach, describe, expect, it, vi } from 'vitest'
import { copyBuildInfo, formatBuildInfo, loadBuildInfo, unknownBuildInfo } from '../src/lib/buildInfo'
import { getBuildInfo, type BuildInfo } from '../src/lib/tauri'

vi.mock('../src/lib/tauri', () => ({ getBuildInfo: vi.fn() }))
const info: BuildInfo = { version: '0.1.0-dev.6', commit: 'a'.repeat(40), trackedState: 'modified' }
afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks() })

describe('About build information', () => {
  it('copies exactly three labelled lines with the complete commit', () => {
    expect(formatBuildInfo(info)).toBe(`Slate: 0.1.0-dev.6\nCommit: ${'a'.repeat(40)}\nTracked changes: Modified`)
    expect(formatBuildInfo(unknownBuildInfo)).toBe('Slate: Unknown\nCommit: Unknown\nTracked changes: Unknown')
    expect(formatBuildInfo({ ...info, trackedState: 'clean' })).toContain('Tracked changes: Clean')
  })
  it('keeps native identity and gracefully handles frontend-only invocation', async () => {
    vi.mocked(getBuildInfo).mockResolvedValueOnce(info).mockRejectedValueOnce(new Error('no Tauri'))
    expect(await loadBuildInfo()).toEqual(info)
    expect(await loadBuildInfo()).toEqual(unknownBuildInfo)
  })
  it('reports success only after clipboard writing succeeds', async () => {
    let finish!: () => void
    const writeText = vi.fn(() => new Promise<void>((resolve) => { finish = resolve }))
    vi.stubGlobal('navigator', { clipboard: { writeText } })
    let settled = false
    const result = copyBuildInfo(info).then((value) => { settled = true; return value })
    await Promise.resolve()
    expect(settled).toBe(false)
    expect(writeText).toHaveBeenCalledWith(formatBuildInfo(info))
    finish()
    expect(await result).toBe('Build info copied.')
  })
  it.each([undefined, { writeText: () => Promise.reject(new Error('denied')) }])('offers manual copy when clipboard is unavailable or denied', async (clipboard) => {
    vi.stubGlobal('navigator', { clipboard })
    expect(await copyBuildInfo(info)).toBe('Could not copy. Select the information above and copy it manually.')
    expect(formatBuildInfo(info)).toContain(info.commit)
  })
})
