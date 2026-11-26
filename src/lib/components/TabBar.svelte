<script lang="ts">
  import { tabs, activeTabId, dirty } from '$lib/stores'
  import { switchToTab, closeTab, closeTabsAround, tabIdsInScope } from '$lib/tabs'
  import { baseName } from '$lib/tauri'
  import { modShortcut } from '$lib/platform'
  import Icon from './Icon.svelte'
  import ContextMenu, { type MenuItem } from './ContextMenu.svelte'

  let menu = $state<{ x: number; y: number; items: MenuItem[] } | null>(null)

  function openMenu(e: MouseEvent, id: string) {
    e.preventDefault()
    // A keyboard-opened menu (Shift+F10 / the Menu key) arrives with no
    // pointer position; anchor it under the tab instead of the window corner.
    let { clientX: x, clientY: y } = e
    if (x === 0 && y === 0) {
      const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
      x = r.left
      y = r.bottom
    }
    const list = $tabs
    const reaches = (scope: 'others' | 'right' | 'left') => tabIdsInScope(list, id, scope).length > 0
    menu = {
      x,
      y,
      items: [
        // Ctrl/Cmd+W closes the *active* tab, so the shortcut is only shown
        // when that's the tab this menu is for.
        { label: 'Close', action: () => closeTab(id), keys: id === $activeTabId ? modShortcut('W') : undefined },
        { label: 'Close Others', action: () => closeTabsAround(id, 'others'), disabled: !reaches('others') },
        { separator: true },
        { label: 'Close to the Right', action: () => closeTabsAround(id, 'right'), disabled: !reaches('right') },
        { label: 'Close to the Left', action: () => closeTabsAround(id, 'left'), disabled: !reaches('left') },
      ],
    }
  }

  // Middle-click closes a tab, as in every browser and tabbed editor. The
  // mousedown default is suppressed so Windows' autoscroll cursor doesn't
  // appear first.
  function onMiddle(e: MouseEvent, id: string) {
    if (e.button !== 1) return
    e.preventDefault()
    closeTab(id)
  }
</script>

{#if $tabs.length > 0}
  <div class="tabbar" role="tablist" aria-label="Open files">
    {#each $tabs as tab (tab.id)}
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div
        class="tab"
        class:active={tab.id === $activeTabId}
        oncontextmenu={(e) => openMenu(e, tab.id)}
        onauxclick={(e) => onMiddle(e, tab.id)}
        onmousedown={(e) => { if (e.button === 1) e.preventDefault() }}
      >
        <button
          class="tab-open"
          role="tab"
          aria-selected={tab.id === $activeTabId}
          onclick={() => switchToTab(tab.id)}
          title={tab.path}
        >
          <span class="tab-label">{baseName(tab.path)}</span>
          <!-- The active tab's unsaved state lives in the `dirty` store until
               tabs.ts snapshots it on a switch, so that one tab reads it there. -->
          {#if tab.id === $activeTabId ? $dirty : tab.dirty}<span class="tab-dot" title="Unsaved changes"></span>{/if}
        </button>
        <button class="tab-close" onclick={() => closeTab(tab.id)} aria-label="Close {baseName(tab.path)}">
          <Icon name="close" size={12} />
        </button>
      </div>
    {/each}
  </div>
{/if}

{#if menu}
  <ContextMenu x={menu.x} y={menu.y} items={menu.items} label="Tab actions" onclose={() => (menu = null)} />
{/if}
