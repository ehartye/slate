import { describe, it, expect, beforeEach } from 'vitest'
import { applyTheme } from '../src/lib/theme'

describe('applyTheme', () => {
  beforeEach(() => {
    document.head.innerHTML = ''
  })
  it('injects a single style element and replaces on re-apply', () => {
    applyTheme(':root{--bg:#000}')
    let style = document.getElementById('active-theme') as HTMLStyleElement
    expect(style).toBeTruthy()
    expect(style.textContent).toContain('--bg:#000')
    applyTheme(':root{--bg:#fff}')
    expect(document.querySelectorAll('#active-theme').length).toBe(1)
    style = document.getElementById('active-theme') as HTMLStyleElement
    expect(style.textContent).toContain('--bg:#fff')
  })
})
