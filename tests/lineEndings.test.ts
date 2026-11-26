import { describe, it, expect } from 'vitest'
import { detectEol, normalizeEol, applyEol } from '../src/lib/lineEndings'

describe('detectEol', () => {
  it('reports the majority line ending', () => {
    expect(detectEol('a\r\nb\r\n')).toBe('\r\n')
    expect(detectEol('a\nb\n')).toBe('\n')
    expect(detectEol('a\r\nb\r\nc\n')).toBe('\r\n')
    expect(detectEol('a\r\nb\nc\n')).toBe('\n')
  })

  it('treats no line breaks, or an even split, as LF', () => {
    expect(detectEol('')).toBe('\n')
    expect(detectEol('single line')).toBe('\n')
    expect(detectEol('a\r\nb\n')).toBe('\n')
  })
})

describe('normalizeEol / applyEol', () => {
  it('round-trips a CRLF file', () => {
    const raw = 'a\r\nb\r\n\r\nc'
    expect(normalizeEol(raw)).toBe('a\nb\n\nc')
    expect(applyEol(normalizeEol(raw), '\r\n')).toBe(raw)
  })

  it('folds lone CRs into LF and leaves LF text alone', () => {
    expect(normalizeEol('a\rb\nc')).toBe('a\nb\nc')
    expect(applyEol('a\nb', '\n')).toBe('a\nb')
  })
})
