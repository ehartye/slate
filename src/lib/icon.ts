import { invoke } from '@tauri-apps/api/core'

function primaryFamily(stack: string): string {
  const first = stack.split(',')[0]?.trim() ?? ''
  return first.replace(/^['"]|['"]$/g, '')
}

/**
 * Draw an "S" monogram in the theme's colors + heading font and set it as the
 * window/taskbar icon. No-op (silently) when not running inside a Tauri window.
 */
export async function updateAppIcon(opts: { bg: string; accent: string; font: string }): Promise<void> {
  try {
    const size = 128
    const canvas = document.createElement('canvas')
    canvas.width = size
    canvas.height = size
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const family = primaryFamily(opts.font) || 'sans-serif'
    try {
      await document.fonts.load(`700 86px "${family}"`)
    } catch {
      /* system font or load unsupported — canvas can still render it */
    }

    ctx.fillStyle = opts.bg || '#111111'
    ctx.fillRect(0, 0, size, size)
    ctx.strokeStyle = opts.accent || '#888888'
    ctx.lineWidth = 6
    ctx.strokeRect(4, 4, size - 8, size - 8)
    ctx.fillStyle = opts.accent || '#888888'
    ctx.font = `700 86px ${opts.font || family}`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText('S', size / 2, size / 2 + 4)

    const rgba = ctx.getImageData(0, 0, size, size).data
    await invoke('set_window_icon', { rgba: Array.from(rgba), width: size, height: size })
  } catch {
    /* not in a Tauri window, or set_icon unsupported — ignore */
  }
}
