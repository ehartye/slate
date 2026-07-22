import { describe, it, expect } from 'vitest'
import {
  clampZoom,
  fitWidthScale,
  fitPageScale,
  currentPageFromVisibility,
  PDF_ZOOM_MIN,
  PDF_ZOOM_MAX,
} from '../src/lib/pdfLayout'

describe('clampZoom', () => {
  it('keeps in-range values unchanged', () => {
    expect(clampZoom(1)).toBe(1)
    expect(clampZoom(PDF_ZOOM_MIN)).toBe(PDF_ZOOM_MIN)
    expect(clampZoom(PDF_ZOOM_MAX)).toBe(PDF_ZOOM_MAX)
  })
  it('clamps out-of-range values to the bounds', () => {
    expect(clampZoom(PDF_ZOOM_MIN - 1)).toBe(PDF_ZOOM_MIN)
    expect(clampZoom(PDF_ZOOM_MAX + 1)).toBe(PDF_ZOOM_MAX)
  })
})

describe('fitWidthScale', () => {
  it('computes the scale that fills the container width', () => {
    expect(fitWidthScale(600, 300)).toBe(2)
    expect(fitWidthScale(300, 600)).toBe(0.5)
  })
  it('clamps the result to the supported zoom range', () => {
    expect(fitWidthScale(1000, 10)).toBe(PDF_ZOOM_MAX)
    expect(fitWidthScale(10, 1000)).toBe(PDF_ZOOM_MIN)
  })
  it('falls back to 1 for degenerate input', () => {
    expect(fitWidthScale(0, 300)).toBe(1)
    expect(fitWidthScale(600, 0)).toBe(1)
    expect(fitWidthScale(-5, 300)).toBe(1)
  })
})

describe('fitPageScale', () => {
  it('uses the tighter of width/height constraints', () => {
    // width wants 2x, height wants 1x -> height (smaller) wins
    expect(fitPageScale(600, 300, 300, 300)).toBe(1)
    // width wants 0.5x, height wants 2x -> width (smaller) wins
    expect(fitPageScale(300, 1200, 600, 600)).toBe(0.5)
  })
  it('clamps the result to the supported zoom range', () => {
    expect(fitPageScale(1000, 1000, 10, 10)).toBe(PDF_ZOOM_MAX)
    expect(fitPageScale(10, 10, 1000, 1000)).toBe(PDF_ZOOM_MIN)
  })
  it('falls back to 1 for degenerate input', () => {
    expect(fitPageScale(0, 300, 300, 300)).toBe(1)
    expect(fitPageScale(300, 0, 300, 300)).toBe(1)
    expect(fitPageScale(300, 300, 0, 300)).toBe(1)
    expect(fitPageScale(300, 300, 300, 0)).toBe(1)
  })
})

describe('currentPageFromVisibility', () => {
  it('picks the page with the highest visible ratio', () => {
    const ratios = new Map([
      [1, 0.1],
      [2, 0.9],
      [3, 0],
    ])
    expect(currentPageFromVisibility(ratios)).toBe(2)
  })
  it('breaks ties by picking the earlier (lower-numbered) page', () => {
    const ratios = new Map([
      [3, 0.5],
      [1, 0.5],
      [2, 0.5],
    ])
    expect(currentPageFromVisibility(ratios)).toBe(1)
  })
  it('falls back to page 1 when nothing is visible yet', () => {
    expect(currentPageFromVisibility(new Map())).toBe(1)
    expect(
      currentPageFromVisibility(
        new Map([
          [1, 0],
          [2, 0],
        ]),
      ),
    ).toBe(1)
  })
})
