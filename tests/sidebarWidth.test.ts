import { describe, it, expect, beforeEach } from 'vitest'
import { clampSidebarWidth, loadSidebarWidth, saveSidebarWidth, SIDEBAR_MIN, SIDEBAR_MAX } from '../src/lib/sidebarWidth'

describe('clampSidebarWidth', () => {
  it('keeps values within range', () => {
    expect(clampSidebarWidth(220)).toBe(220)
    expect(clampSidebarWidth(SIDEBAR_MIN)).toBe(SIDEBAR_MIN)
    expect(clampSidebarWidth(SIDEBAR_MAX)).toBe(SIDEBAR_MAX)
  })
  it('clamps out-of-range values to the bounds', () => {
    expect(clampSidebarWidth(SIDEBAR_MIN - 50)).toBe(SIDEBAR_MIN)
    expect(clampSidebarWidth(SIDEBAR_MAX + 50)).toBe(SIDEBAR_MAX)
  })
  it('rounds to a whole pixel', () => {
    expect(clampSidebarWidth(250.6)).toBe(251)
  })
})

describe('loadSidebarWidth / saveSidebarWidth', () => {
  beforeEach(() => localStorage.clear())
  it('defaults to 220 when nothing is stored', () => {
    expect(loadSidebarWidth()).toBe(220)
  })
  it('round-trips a saved value', () => {
    saveSidebarWidth(300)
    expect(loadSidebarWidth()).toBe(300)
  })
  it('clamps a persisted out-of-range value on load', () => {
    localStorage.setItem('slate.sidebarWidth', '9999')
    expect(loadSidebarWidth()).toBe(SIDEBAR_MAX)
  })
  it('falls back to default on garbage', () => {
    localStorage.setItem('slate.sidebarWidth', 'not-a-number')
    expect(loadSidebarWidth()).toBe(220)
  })
})
