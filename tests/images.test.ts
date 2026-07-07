import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../src/lib/tauri', async (importOriginal) => {
  const orig = await importOriginal<typeof import('../src/lib/tauri')>()
  return { ...orig, resolveImageDataUrl: vi.fn() }
})

import { isLocalImageSrc, inlineLocalImages, clearImageCache } from '../src/lib/images'
import { resolveImageDataUrl } from '../src/lib/tauri'

const mockResolve = vi.mocked(resolveImageDataUrl)

beforeEach(() => {
  vi.clearAllMocks()
  clearImageCache()
})

describe('isLocalImageSrc', () => {
  it('treats relative paths as local', () => {
    expect(isLocalImageSrc('diagram.png')).toBe(true)
    expect(isLocalImageSrc('./assets/diagram.png')).toBe(true)
    expect(isLocalImageSrc('../assets/diagram.png')).toBe(true)
  })
  it('excludes remote and data/mailto/tel URLs', () => {
    expect(isLocalImageSrc('https://example.com/a.png')).toBe(false)
    expect(isLocalImageSrc('http://example.com/a.png')).toBe(false)
    expect(isLocalImageSrc('data:image/png;base64,abc')).toBe(false)
    expect(isLocalImageSrc('mailto:a@b.com')).toBe(false)
    expect(isLocalImageSrc('tel:12345')).toBe(false)
  })
  it('rejects an empty src', () => {
    expect(isLocalImageSrc('')).toBe(false)
  })
})

describe('inlineLocalImages', () => {
  it('replaces a relative img src with the resolved data URL', async () => {
    mockResolve.mockResolvedValue('data:image/png;base64,AAAA')
    const root = document.createElement('div')
    root.innerHTML = '<img src="diagram.png" alt="d">'

    await inlineLocalImages(root, '/docs/index.md')

    expect(mockResolve).toHaveBeenCalledWith('/docs/index.md', 'diagram.png')
    expect(root.querySelector('img')?.getAttribute('src')).toBe('data:image/png;base64,AAAA')
  })

  it('leaves remote image srcs untouched and never calls resolve', async () => {
    const root = document.createElement('div')
    root.innerHTML = '<img src="https://example.com/a.png" alt="d">'

    await inlineLocalImages(root, '/docs/index.md')

    expect(mockResolve).not.toHaveBeenCalled()
    expect(root.querySelector('img')?.getAttribute('src')).toBe('https://example.com/a.png')
  })

  it('leaves the src unchanged when resolution finds nothing', async () => {
    mockResolve.mockResolvedValue(null)
    const root = document.createElement('div')
    root.innerHTML = '<img src="missing.png" alt="d">'

    await inlineLocalImages(root, '/docs/index.md')

    expect(root.querySelector('img')?.getAttribute('src')).toBe('missing.png')
  })

  it('leaves the src unchanged when resolution rejects', async () => {
    mockResolve.mockRejectedValue(new Error('boom'))
    const root = document.createElement('div')
    root.innerHTML = '<img src="broken.png" alt="d">'

    await inlineLocalImages(root, '/docs/index.md')

    expect(root.querySelector('img')?.getAttribute('src')).toBe('broken.png')
  })

  it('caches by base+src so a repeat call does not re-resolve', async () => {
    mockResolve.mockResolvedValue('data:image/png;base64,AAAA')
    const root1 = document.createElement('div')
    root1.innerHTML = '<img src="diagram.png" alt="d">'
    await inlineLocalImages(root1, '/docs/index.md')

    const root2 = document.createElement('div')
    root2.innerHTML = '<img src="diagram.png" alt="d">'
    await inlineLocalImages(root2, '/docs/index.md')

    expect(mockResolve).toHaveBeenCalledTimes(1)
    expect(root2.querySelector('img')?.getAttribute('src')).toBe('data:image/png;base64,AAAA')
  })

  it('clearImageCache forces re-resolution', async () => {
    mockResolve.mockResolvedValue('data:image/png;base64,AAAA')
    const root1 = document.createElement('div')
    root1.innerHTML = '<img src="diagram.png" alt="d">'
    await inlineLocalImages(root1, '/docs/index.md')

    clearImageCache()

    const root2 = document.createElement('div')
    root2.innerHTML = '<img src="diagram.png" alt="d">'
    await inlineLocalImages(root2, '/docs/index.md')

    expect(mockResolve).toHaveBeenCalledTimes(2)
  })
})
