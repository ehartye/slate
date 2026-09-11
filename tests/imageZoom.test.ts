import { describe, it, expect } from 'vitest'
import { MIN_ZOOM, MAX_ZOOM, zoomIn, zoomOut, clampZoom } from '../src/lib/imageZoom'

describe('image zoom steps', () => {
  it('steps up and down by a constant ratio', () => {
    expect(zoomIn(1)).toBeCloseTo(1.25)
    expect(zoomOut(1)).toBeCloseTo(0.8)
  })

  it('round-trips back to where it started', () => {
    // Stepping out then in should land on 1, not drift — the ratio is applied
    // in both directions rather than added/subtracted.
    expect(zoomIn(zoomOut(1))).toBeCloseTo(1)
  })

  it('treats fit mode (null) as 100% for the first step', () => {
    // Fit is a layout mode, not a number, so the first explicit zoom has to
    // start from actual size rather than from an unknown fitted scale.
    expect(zoomIn(null)).toBeCloseTo(1.25)
    expect(zoomOut(null)).toBeCloseTo(0.8)
  })

  it('clamps to the supported range', () => {
    expect(clampZoom(99)).toBe(MAX_ZOOM)
    expect(clampZoom(0.0001)).toBe(MIN_ZOOM)
    expect(clampZoom(1)).toBe(1)
  })

  it('cannot step past the bounds', () => {
    expect(zoomIn(MAX_ZOOM)).toBe(MAX_ZOOM)
    expect(zoomOut(MIN_ZOOM)).toBe(MIN_ZOOM)
  })
})
