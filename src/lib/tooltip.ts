// Quick, theme-colored tooltips for the icon buttons: what the button does,
// optionally one line of context ("Choose a folder first"), and its keyboard
// shortcut as keycaps.
//
// Native `title` tooltips were what these buttons had before. They're slow to
// appear (~1s), can't show a shortcut legibly, ignore the theme, and never
// appear for keyboard focus — the people who most need a label for an
// icon-only button. This is a Svelte action so any button can opt in with
// `use:tip={{ label, hint, keys }}`.
//
// One shared element, positioned `fixed` and appended to <body>: the sidebar
// and tab strip both scroll (`overflow: auto`), and a tooltip rendered inside
// either would be clipped by it.

export interface TipOptions {
  /** What the control does — also becomes its accessible name if it has none. */
  label: string
  /** Optional second line: state, or why the control is disabled. */
  hint?: string
  /** Keycaps, e.g. ['Ctrl', 'W']. */
  keys?: string[]
}

const SHOW_DELAY = 350
/** Moving from one tooltip'd button to the next within this window shows the
 *  next tooltip immediately — scanning a row of icons shouldn't mean waiting
 *  out the delay on every one. */
const WARM_WINDOW = 500
const GAP = 6
const EDGE = 6

let el: HTMLDivElement | null = null
let owner: HTMLElement | null = null
let showTimer: ReturnType<typeof setTimeout> | null = null
let lastHiddenAt = 0

function ensureEl(): HTMLDivElement {
  if (el) return el
  el = document.createElement('div')
  el.className = 'tip'
  el.setAttribute('role', 'tooltip')
  // The control's own aria-label already carries the label; the tooltip is a
  // visual echo, so it stays out of the accessibility tree to avoid being
  // announced twice.
  el.setAttribute('aria-hidden', 'true')
  document.body.appendChild(el)
  return el
}

function render(opts: TipOptions) {
  const tip = ensureEl()
  tip.replaceChildren()
  const row = document.createElement('div')
  row.className = 'tip-row'
  const label = document.createElement('span')
  label.textContent = opts.label
  row.appendChild(label)
  if (opts.keys?.length) {
    const keys = document.createElement('span')
    keys.className = 'tip-keys'
    for (const k of opts.keys) {
      const kbd = document.createElement('kbd')
      kbd.textContent = k
      keys.appendChild(kbd)
    }
    row.appendChild(keys)
  }
  tip.appendChild(row)
  if (opts.hint) {
    const hint = document.createElement('div')
    hint.className = 'tip-hint'
    hint.textContent = opts.hint
    tip.appendChild(hint)
  }
}

function place(node: HTMLElement) {
  const tip = ensureEl()
  const r = node.getBoundingClientRect()
  const t = tip.getBoundingClientRect()
  let top = r.bottom + GAP
  let below = true
  if (top + t.height > window.innerHeight - EDGE) {
    top = r.top - GAP - t.height
    below = false
  }
  const left = Math.min(
    Math.max(EDGE, r.left + r.width / 2 - t.width / 2),
    window.innerWidth - t.width - EDGE,
  )
  tip.style.left = `${Math.round(left)}px`
  tip.style.top = `${Math.round(top)}px`
  tip.dataset.side = below ? 'below' : 'above'
}

function show(node: HTMLElement, opts: TipOptions) {
  owner = node
  render(opts)
  const tip = ensureEl()
  tip.classList.remove('visible')
  place(node)
  // Next frame, so the fade starts from the newly placed position.
  requestAnimationFrame(() => { if (owner === node) tip.classList.add('visible') })
}

function hide(node?: HTMLElement) {
  if (showTimer) { clearTimeout(showTimer); showTimer = null }
  if (node && owner !== node) return
  if (owner) lastHiddenAt = performance.now()
  owner = null
  el?.classList.remove('visible')
}

export function tip(node: HTMLElement, initial: TipOptions) {
  let opts = initial
  const syncAriaLabel = () => {
    if (!node.hasAttribute('aria-label') || node.dataset.tipLabelled === 'true') {
      node.setAttribute('aria-label', opts.label)
      node.dataset.tipLabelled = 'true'
    }
  }
  syncAriaLabel()

  const schedule = () => {
    if (showTimer) clearTimeout(showTimer)
    const warm = performance.now() - lastHiddenAt < WARM_WINDOW
    showTimer = setTimeout(() => show(node, opts), warm ? 0 : SHOW_DELAY)
  }
  const onEnter = () => schedule()
  const onLeave = () => hide(node)
  const onFocus = () => { if (node.matches(':focus-visible')) show(node, opts) }
  const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') hide(node) }
  const onDismiss = () => hide()

  node.addEventListener('pointerenter', onEnter)
  node.addEventListener('pointerleave', onLeave)
  node.addEventListener('pointerdown', onLeave)
  node.addEventListener('focus', onFocus)
  node.addEventListener('blur', onLeave)
  node.addEventListener('keydown', onKey)
  window.addEventListener('scroll', onDismiss, true)
  window.addEventListener('blur', onDismiss)

  return {
    update(next: TipOptions) {
      opts = next
      syncAriaLabel()
      if (owner === node) { render(opts); place(node) }
    },
    destroy() {
      hide(node)
      node.removeEventListener('pointerenter', onEnter)
      node.removeEventListener('pointerleave', onLeave)
      node.removeEventListener('pointerdown', onLeave)
      node.removeEventListener('focus', onFocus)
      node.removeEventListener('blur', onLeave)
      node.removeEventListener('keydown', onKey)
      window.removeEventListener('scroll', onDismiss, true)
      window.removeEventListener('blur', onDismiss)
    },
  }
}
