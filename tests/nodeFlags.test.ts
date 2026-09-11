import { describe, it, expect } from 'vitest'
import { needsNoWebStorage } from '../vitest.nodeFlags'

describe('needsNoWebStorage', () => {
  it('is false below Node 25, where the flag does not exist', () => {
    expect(needsNoWebStorage('20.11.1')).toBe(false)
    expect(needsNoWebStorage('24.9.0')).toBe(false)
  })

  it('is true from Node 25 up, where Web Storage is on by default', () => {
    expect(needsNoWebStorage('25.0.0')).toBe(true)
    expect(needsNoWebStorage('26.7.0')).toBe(true)
  })

  it('tolerates the leading v of process.version', () => {
    expect(needsNoWebStorage('v25.0.0')).toBe(true)
    expect(needsNoWebStorage('v24.9.0')).toBe(false)
  })

  it('omits the flag when the version is unparseable', () => {
    // Passing an unsupported flag aborts the whole run before any test
    // executes; omitting it fails only the localStorage suites, with an
    // error CLAUDE.md explains. Prefer the diagnosable failure.
    expect(needsNoWebStorage('')).toBe(false)
    expect(needsNoWebStorage('not-a-version')).toBe(false)
  })
})
