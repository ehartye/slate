// Inlines relative-path <img> sources as base64 data: URLs, so images
// referenced from markdown (`![alt](diagram.png)`) render both in the live
// preview and in the standalone-HTML "Open in browser" export — neither of
// which can otherwise resolve a path relative to the source file on disk.
import { resolveImageDataUrl } from './tauri'

const REMOTE_OR_DATA_SRC = /^(https?:|data:|mailto:|tel:)/i

/** True if `src` should be resolved against the local filesystem rather than
 *  left for the webview to load directly (remote URLs, data URIs, etc.). */
export function isLocalImageSrc(src: string): boolean {
  return src.length > 0 && !REMOTE_OR_DATA_SRC.test(src)
}

// Keyed by `${baseFile}::${src}` so switching files (or an unrelated edit)
// doesn't force a re-read of images whose reference hasn't changed.
const cache = new Map<string, string | null>()

/** Drop all cached resolved image data URLs — call after an external file
 *  reload, in case an image on disk changed underneath an unchanged reference. */
export function clearImageCache(): void {
  cache.clear()
}

/**
 * Replace every relative-path `<img>` under `root` with an inlined `data:` URL
 * resolved against `baseFile`'s directory. Missing/unsupported images are left
 * as-is (the browser shows its normal broken-image affordance).
 */
export async function inlineLocalImages(root: ParentNode, baseFile: string): Promise<void> {
  const imgs = Array.from(root.querySelectorAll('img[src]'))
  await Promise.all(
    imgs.map(async (img) => {
      const src = img.getAttribute('src')
      if (!src || !isLocalImageSrc(src)) return
      const key = `${baseFile}::${src}`
      let dataUrl = cache.get(key)
      if (dataUrl === undefined) {
        try {
          dataUrl = await resolveImageDataUrl(baseFile, decodeURIComponent(src))
        } catch {
          dataUrl = null
        }
        cache.set(key, dataUrl)
      }
      if (dataUrl) img.setAttribute('src', dataUrl)
    }),
  )
}
