import { describe, it, expect } from 'vitest'
import { annotationRectToPercent, resolveDestinationPage, type DestinationResolver } from '../src/lib/pdfLinks'

describe('annotationRectToPercent', () => {
  it('converts an identity-transformed rect to percentages of the page size', () => {
    // No rotation/flip: convert is a no-op passthrough.
    const identity = (x: number, y: number): [number, number] => [x, y]
    const got = annotationRectToPercent([100, 200, 300, 400], identity, 600, 800)
    expect(got.leftPct).toBeCloseTo((100 / 600) * 100, 5)
    expect(got.topPct).toBeCloseTo((200 / 800) * 100, 5)
    expect(got.widthPct).toBeCloseTo((200 / 600) * 100, 5)
    expect(got.heightPct).toBeCloseTo((200 / 800) * 100, 5)
  })

  it('handles a Y-flip transform (PDF bottom-left origin -> screen top-left)', () => {
    // Simulates pdf.js's default viewport transform: y is flipped relative
    // to the page height, x passes through unchanged.
    const pageHeight = 800
    const flip = (x: number, y: number): [number, number] => [x, pageHeight - y]
    // PDF rect y1=200 (near bottom in PDF space) should end up near the
    // BOTTOM of the screen rect (higher top%), not the top.
    const got = annotationRectToPercent([100, 600, 300, 700], flip, 600, pageHeight)
    // After flip: (100,200) and (300,100) -> screen y's are 200 and 100.
    // top = min(200,100) = 100 -> topPct = 100/800*100 = 12.5
    expect(got.topPct).toBeCloseTo(12.5, 5)
    expect(got.heightPct).toBeCloseTo((100 / 800) * 100, 5)
  })

  it('normalizes rects regardless of corner order', () => {
    const identity = (x: number, y: number): [number, number] => [x, y]
    const a = annotationRectToPercent([300, 400, 100, 200], identity, 600, 800)
    const b = annotationRectToPercent([100, 200, 300, 400], identity, 600, 800)
    expect(a).toEqual(b)
  })

  it('falls back to a safe divisor for zero/degenerate page dimensions', () => {
    const identity = (x: number, y: number): [number, number] => [x, y]
    const got = annotationRectToPercent([0, 0, 10, 10], identity, 0, 0)
    expect(Number.isFinite(got.leftPct)).toBe(true)
    expect(Number.isFinite(got.topPct)).toBe(true)
  })
})

describe('resolveDestinationPage', () => {
  function makeResolver(overrides: Partial<DestinationResolver> = {}): DestinationResolver {
    return {
      getDestination: async () => null,
      getPageIndex: async () => 0,
      ...overrides,
    }
  }

  it('resolves an already-explicit destination array with an object ref', async () => {
    const ref = { num: 5, gen: 0 }
    const resolver = makeResolver({
      getPageIndex: async (r) => {
        expect(r).toBe(ref)
        return 4 // 0-based
      },
    })
    const page = await resolveDestinationPage(resolver, [ref, { name: 'XYZ' }, 0, 800, 0])
    expect(page).toBe(5) // 1-based
  })

  it('resolves a named destination by looking it up first', async () => {
    const ref = { num: 9, gen: 0 }
    const resolver = makeResolver({
      getDestination: async (name) => {
        expect(name).toBe('chapter2')
        return [ref, { name: 'Fit' }]
      },
      getPageIndex: async () => 2, // 0-based
    })
    const page = await resolveDestinationPage(resolver, 'chapter2')
    expect(page).toBe(3) // 1-based
  })

  it('resolves a destination whose ref is a plain integer page index', async () => {
    const resolver = makeResolver()
    const page = await resolveDestinationPage(resolver, [3, { name: 'Fit' }])
    expect(page).toBe(4) // 1-based
  })

  it('returns null when the named destination does not resolve to an array', async () => {
    const resolver = makeResolver({ getDestination: async () => null })
    const page = await resolveDestinationPage(resolver, 'missing')
    expect(page).toBeNull()
  })

  it('returns null when getPageIndex rejects (invalid page reference)', async () => {
    const resolver = makeResolver({
      getPageIndex: async () => {
        throw new Error('invalid ref')
      },
    })
    const page = await resolveDestinationPage(resolver, [{ num: 1, gen: 0 }, { name: 'Fit' }])
    expect(page).toBeNull()
  })

  it('returns null for a malformed (non-array, non-string) destination', async () => {
    const resolver = makeResolver()
    // @ts-expect-error deliberately malformed input
    const page = await resolveDestinationPage(resolver, 42)
    expect(page).toBeNull()
  })
})
