<script lang="ts" module>
  export type MenuItem =
    | { label: string; action: () => void; disabled?: boolean; keys?: string[] }
    | { separator: true }
</script>

<script lang="ts">
  import { onMount } from 'svelte'

  // A right-click menu shared by the tab strip and the file browser.
  // Rendered `position: fixed` so it escapes both of their scroll containers,
  // clamped into the window, and keyboard-driven like a native menu:
  // arrows/Home/End move, Enter/Space activate, Escape or Tab dismiss, and
  // focus goes back where it came from.
  let {
    x, y, items, label, onclose,
  }: { x: number; y: number; items: MenuItem[]; label: string; onclose: () => void } = $props()

  let menu = $state<HTMLDivElement>()
  // Parked off-screen until onMount has measured and clamped the menu.
  let left = $state(-9999)
  let top = $state(-9999)
  let returnFocus: Element | null = null

  const EDGE = 6

  function buttons(): HTMLButtonElement[] {
    return menu ? [...menu.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')] : []
  }

  function move(delta: 1 | -1 | 'first' | 'last') {
    const list = buttons()
    if (list.length === 0) return
    const at = list.indexOf(document.activeElement as HTMLButtonElement)
    const next =
      delta === 'first' ? 0
      : delta === 'last' ? list.length - 1
      : (at + delta + list.length) % list.length
    list[next].focus()
  }

  function onKeydown(e: KeyboardEvent) {
    if (e.key === 'ArrowDown') { e.preventDefault(); move(1) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); move(-1) }
    else if (e.key === 'Home') { e.preventDefault(); move('first') }
    else if (e.key === 'End') { e.preventDefault(); move('last') }
    else if (e.key === 'Escape' || e.key === 'Tab') { e.preventDefault(); onclose() }
    e.stopPropagation() // keep app shortcuts (Ctrl+W…) from firing underneath
  }

  function run(item: Extract<MenuItem, { label: string }>) {
    onclose()
    item.action()
  }

  onMount(() => {
    returnFocus = document.activeElement
    const onPointerDown = (e: PointerEvent) => {
      if (menu && !menu.contains(e.target as Node)) onclose()
    }
    const onDismiss = () => onclose()
    window.addEventListener('pointerdown', onPointerDown, true)
    window.addEventListener('blur', onDismiss)
    window.addEventListener('resize', onDismiss)

    // Measured before the first paint, so a menu opened near the window's
    // edge never flashes partly off-screen before being pulled back in.
    if (menu) {
      const r = menu.getBoundingClientRect()
      left = Math.max(EDGE, Math.min(x, window.innerWidth - r.width - EDGE))
      top = Math.max(EDGE, Math.min(y, window.innerHeight - r.height - EDGE))
      move('first')
    }

    return () => {
      window.removeEventListener('pointerdown', onPointerDown, true)
      window.removeEventListener('blur', onDismiss)
      window.removeEventListener('resize', onDismiss)
      if (menu?.contains(document.activeElement) && returnFocus instanceof HTMLElement) {
        returnFocus.focus()
      }
    }
  })
</script>

<!-- svelte-ignore a11y_interactive_supports_focus -->
<div
  class="context-menu"
  role="menu"
  aria-label={label}
  tabindex="-1"
  bind:this={menu}
  style="left: {left}px; top: {top}px"
  onkeydown={onKeydown}
  oncontextmenu={(e) => e.preventDefault()}
>
  {#each items as item, i (i)}
    {#if 'separator' in item}
      <div class="menu-sep" role="separator"></div>
    {:else}
      <button role="menuitem" disabled={item.disabled} onclick={() => run(item)}>
        <span class="menu-label">{item.label}</span>
        {#if item.keys}
          <span class="menu-keys">{#each item.keys as k (k)}<kbd>{k}</kbd>{/each}</span>
        {/if}
      </button>
    {/if}
  {/each}
</div>
