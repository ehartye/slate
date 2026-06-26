import { invoke } from '@tauri-apps/api/core'
import { activeThemeName, activeMode, activeMermaidMode } from './stores'

export interface Theme {
  name: string // family, e.g. "Aurora"
  mode: 'light' | 'dark'
  mermaid: 'default' | 'dark'
  accent: string // representative --accent, for picker swatches
  bg: string // representative --bg, for picker swatches
  css: string
}

export const listThemes = () => invoke<Theme[]>('list_themes')

/** Inject the theme CSS as the single #active-theme <style>, replacing any prior. */
export function applyTheme(css: string): void {
  let style = document.getElementById('active-theme') as HTMLStyleElement | null
  if (!style) {
    style = document.createElement('style')
    style.id = 'active-theme'
    document.head.appendChild(style)
  }
  style.textContent = css
}

const SAVED_KEY = 'slate.theme'

/** Apply a theme variant, sync the active-theme stores, and remember the choice. */
export function applyThemeVariant(t: Theme): void {
  applyTheme(t.css)
  activeThemeName.set(t.name)
  activeMode.set(t.mode)
  activeMermaidMode.set(t.mermaid)
  try {
    localStorage.setItem(SAVED_KEY, JSON.stringify({ name: t.name, mode: t.mode }))
  } catch {
    /* localStorage unavailable — non-fatal */
  }
}

/** The remembered { name, mode } selection, or null if none/unreadable. */
export function savedThemeChoice(): { name: string; mode: string } | null {
  try {
    return JSON.parse(localStorage.getItem(SAVED_KEY) ?? 'null')
  } catch {
    return null
  }
}

/** Read a single CSS custom-property value from a theme's css text (e.g. "--accent"). */
export function cssVar(css: string, name: string): string {
  const m = css.match(new RegExp(name + '\\s*:\\s*([^;]+)'))
  return m ? m[1].trim() : ''
}
