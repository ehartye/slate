import { describe, it, expect } from 'vitest'
import { fuzzyFindAll } from '../src/lib/search'

describe('fuzzyFindAll', () => {
  it('returns nothing for an empty query', () => {
    expect(fuzzyFindAll('hello world', '')).toEqual([])
  })

  it('finds an exact literal substring as a zero-gap match', () => {
    const matches = fuzzyFindAll('the quick brown fox', 'quick')
    expect(matches).toEqual([{ start: 4, end: 9 }])
  })

  it('is case-insensitive', () => {
    const matches = fuzzyFindAll('The Quick Brown Fox', 'quick')
    expect(matches).toEqual([{ start: 4, end: 9 }])
  })

  it('finds a fuzzy match with small character gaps', () => {
    // "mkdown" as a subsequence of "markdown": m-a-r-k-d-o-w-n, skipping a,r.
    const matches = fuzzyFindAll('markdown editor', 'mkdown')
    expect(matches).toEqual([{ start: 0, end: 8 }]) // "markdown"
  })

  it('rejects a candidate whose tightest span exceeds the slack budget', () => {
    // "ab" subsequence exists but only spanning the whole string, well past maxSlack.
    const text = 'a' + 'x'.repeat(50) + 'b'
    expect(fuzzyFindAll(text, 'ab', 8)).toEqual([])
  })

  it('accepts a candidate within the slack budget', () => {
    const text = 'a' + 'x'.repeat(3) + 'b'
    const matches = fuzzyFindAll(text, 'ab', 8)
    expect(matches).toEqual([{ start: 0, end: 5 }])
  })

  it('finds multiple non-overlapping matches in document order', () => {
    const matches = fuzzyFindAll('cat sat on cat mat', 'cat')
    expect(matches).toEqual([
      { start: 0, end: 3 },
      { start: 11, end: 14 },
    ])
  })

  it('matches every occurrence of a single character', () => {
    const matches = fuzzyFindAll('banana', 'a')
    expect(matches).toEqual([
      { start: 1, end: 2 },
      { start: 3, end: 4 },
      { start: 5, end: 6 },
    ])
  })

  it('returns nothing when the query cannot be found at all', () => {
    expect(fuzzyFindAll('hello world', 'xyz')).toEqual([])
  })

  it('does not let matches overlap', () => {
    // "aa" search in "aaa" should not double-count overlapping windows.
    const matches = fuzzyFindAll('aaa', 'aa')
    expect(matches).toEqual([{ start: 0, end: 2 }])
  })
})
