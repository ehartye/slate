import { describe, it, expect, beforeEach } from 'vitest'
import { get } from 'svelte/store'
import { mdOnlyMode, showHiddenFiles } from '../src/lib/stores'
import {
  loadMdOnlyMode, setMdOnlyMode, loadShowHiddenFiles, setShowHiddenFiles,
} from '../src/lib/viewOptions'

describe('mdOnlyMode persistence', () => {
  beforeEach(() => localStorage.clear())

  it('defaults to true when nothing is stored', () => {
    expect(loadMdOnlyMode()).toBe(true)
  })
  it('round-trips a saved false', () => {
    setMdOnlyMode(false)
    expect(loadMdOnlyMode()).toBe(false)
    expect(get(mdOnlyMode)).toBe(false)
  })
  it('round-trips a saved true', () => {
    setMdOnlyMode(false)
    setMdOnlyMode(true)
    expect(loadMdOnlyMode()).toBe(true)
    expect(get(mdOnlyMode)).toBe(true)
  })
})

describe('showHiddenFiles persistence', () => {
  beforeEach(() => localStorage.clear())

  it('defaults to false when nothing is stored', () => {
    expect(loadShowHiddenFiles()).toBe(false)
  })
  it('round-trips a saved true', () => {
    setShowHiddenFiles(true)
    expect(loadShowHiddenFiles()).toBe(true)
    expect(get(showHiddenFiles)).toBe(true)
  })
})
