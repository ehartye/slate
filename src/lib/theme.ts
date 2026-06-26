import { invoke } from '@tauri-apps/api/core'

export interface Theme {
  name: string
  mermaid: 'default' | 'dark'
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
