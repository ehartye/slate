// Pure fuzzy text search: no DOM, no Svelte — just string in, match spans out.
// See documentSearch.ts for the DOM highlighting layer built on top of this.

export interface SearchMatch {
  start: number
  end: number // exclusive
}

const DEFAULT_MAX_SLACK = 8

/**
 * Find non-overlapping matches of `query` in `text`, in left-to-right document
 * order. Each match's span is the *tightest* run of text containing query's
 * characters in order (case-insensitive) — an exact literal substring is just
 * the zero-gap case of this, so this single algorithm covers both plain and
 * "fuzzy" (typo/character-skipping) search without a separate code path.
 *
 * A candidate match is rejected if its span would exceed `query.length +
 * maxSlack`, so a handful of incidentally-ordered characters can't produce a
 * match spanning the entire document.
 */
export function fuzzyFindAll(text: string, query: string, maxSlack = DEFAULT_MAX_SLACK): SearchMatch[] {
  if (!query) return []
  const hay = text.toLowerCase()
  const q = query.toLowerCase()
  const matches: SearchMatch[] = []
  const budget = q.length + maxSlack

  let start = hay.indexOf(q[0])
  while (start !== -1) {
    const end = matchSubsequenceEnd(hay, q, start)
    if (end !== -1 && end - start <= budget) {
      matches.push({ start, end })
      start = hay.indexOf(q[0], end) // resume past this match — no overlaps
    } else {
      start = hay.indexOf(q[0], start + 1)
    }
  }
  return matches
}

/**
 * Greedily consume `hay` from `start` (where `hay[start] === q[0]` is assumed),
 * matching each character of `q` against the next occurrence in `hay`.
 * Returns the exclusive end index of the tightest such match, or -1 if `q`
 * doesn't fully occur as a subsequence from `start` onward.
 */
function matchSubsequenceEnd(hay: string, q: string, start: number): number {
  let hi = start
  let qi = 0
  while (qi < q.length && hi < hay.length) {
    if (hay[hi] === q[qi]) qi++
    hi++
  }
  return qi === q.length ? hi : -1
}
