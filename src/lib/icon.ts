import { invoke } from '@tauri-apps/api/core'

function primaryFamily(stack: string): string {
  const first = stack.split(',')[0]?.trim() ?? ''
  return first.replace(/^['"]|['"]$/g, '')
}

/** Relative luminance (0..1) of an already-painted pixel, for contrast choices. */
function luminance(r: number, g: number, b: number): number {
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255
}

/**
 * Draw an "S" monogram as a rounded accent tile with a luminance-matched glyph
 * in the theme's heading font, and set it as the window/taskbar icon. No-op
 * (silently) when not running inside a Tauri window.
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
      await document.fonts.load(`700 80px "${family}"`)
    } catch {
      /* system font or load unsupported — canvas can still render it */
    }

    const accent = opts.accent || '#888888'
    ctx.clearRect(0, 0, size, size)

    // Rounded tile, inset so the corners read as rounded against the taskbar.
    const m = 9
    const radius = 30
    const x = m
    const y = m
    const w = size - 2 * m
    const h = size - 2 * m
    const traceTile = () => {
      ctx.beginPath()
      ctx.roundRect(x, y, w, h, radius)
    }

    // Accent fill.
    traceTile()
    ctx.fillStyle = accent
    ctx.fill()

    // Depth: light top → dark bottom, clipped to the tile. Color-agnostic, so it
    // works for any accent without parsing it.
    ctx.save()
    traceTile()
    ctx.clip()
    const grad = ctx.createLinearGradient(0, y, 0, y + h)
    grad.addColorStop(0, 'rgba(255,255,255,0.22)')
    grad.addColorStop(0.5, 'rgba(255,255,255,0)')
    grad.addColorStop(1, 'rgba(0,0,0,0.20)')
    ctx.fillStyle = grad
    ctx.fillRect(x, y, w, h)
    ctx.restore()

    // Thin top gloss for a refined edge.
    ctx.save()
    traceTile()
    ctx.strokeStyle = 'rgba(255,255,255,0.16)'
    ctx.lineWidth = 1.5
    ctx.stroke()
    ctx.restore()

    // Pick a glyph color that contrasts with the (now-painted) accent.
    const c = ctx.getImageData(size / 2, size / 2, 1, 1).data
    const glyph = luminance(c[0], c[1], c[2]) > 0.58 ? '#0b0b0c' : '#ffffff'

    // Fit the glyph inside the tile (wide faces like Press Start 2P would clip).
    let fontPx = 80
    ctx.font = `700 ${fontPx}px ${opts.font || family}`
    const maxW = w * 0.66
    const measured = ctx.measureText('S').width
    if (measured > maxW) {
      fontPx = Math.floor((fontPx * maxW) / measured)
      ctx.font = `700 ${fontPx}px ${opts.font || family}`
    }

    // Glyph with a soft shadow for depth.
    ctx.save()
    ctx.shadowColor = 'rgba(0,0,0,0.30)'
    ctx.shadowBlur = 5
    ctx.shadowOffsetY = 2
    ctx.fillStyle = glyph
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText('S', size / 2, size / 2 + 4)
    ctx.restore()

    const rgba = ctx.getImageData(0, 0, size, size).data
    await invoke('set_window_icon', { rgba: Array.from(rgba), width: size, height: size })
  } catch {
    /* not in a Tauri window, or set_icon unsupported — ignore */
  }
}
