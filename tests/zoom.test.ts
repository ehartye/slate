import { describe, it, expect, beforeEach } from 'vitest'
import { clampZoom, loadZoom, saveZoom, ZOOM_MIN, ZOOM_MAX } from '../src/lib/zoom'

describe('clampZoom', () => {
  it('keeps values within range', () => {
    expect(clampZoom(1)).toBe(1)
    expect(clampZoom(ZOOM_MIN)).toBe(ZOOM_MIN)
    expect(clampZoom(ZOOM_MAX)).toBe(ZOOM_MAX)
  })
  it('clamps out-of-range values to the bounds', () => {
    expect(clampZoom(ZOOM_MIN - 1)).toBe(ZOOM_MIN)
    expect(clampZoom(ZOOM_MAX + 1)).toBe(ZOOM_MAX)
  })
  it('rounds to a clean step, avoiding float drift', () => {
    expect(clampZoom(1.1 + 0.1)).toBeCloseTo(1.2, 5)
    expect(clampZoom(1.2000000001)).toBe(1.2)
  })
})

describe('loadZoom / saveZoom', () => {
  beforeEach(() => localStorage.clear())
  it('defaults to 1 when nothing is stored', () => {
    expect(loadZoom()).toBe(1)
  })
  it('round-trips a saved value', () => {
    saveZoom(1.5)
    expect(loadZoom()).toBe(1.5)
  })
  it('clamps a persisted out-of-range value on load', () => {
    localStorage.setItem('slate.zoom', '99')
    expect(loadZoom()).toBe(ZOOM_MAX)
  })
  it('falls back to 1 on garbage', () => {
    localStorage.setItem('slate.zoom', 'not-a-number')
    expect(loadZoom()).toBe(1)
  })
})
