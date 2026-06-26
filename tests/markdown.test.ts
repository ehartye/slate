import { describe, it, expect } from 'vitest'
import { renderMarkdown } from '../src/lib/markdown'

describe('renderMarkdown', () => {
  it('renders headings and paragraphs', () => {
    expect(renderMarkdown('# Hello')).toContain('<h1>Hello</h1>')
  })
  it('renders GFM tables', () => {
    const md = '| a | b |\n| - | - |\n| 1 | 2 |'
    expect(renderMarkdown(md)).toContain('<table>')
  })
  it('renders task lists', () => {
    expect(renderMarkdown('- [x] done')).toContain('type="checkbox"')
  })
  it('autolinks bare URLs', () => {
    expect(renderMarkdown('see https://example.com')).toContain('<a href="https://example.com"')
  })
})
