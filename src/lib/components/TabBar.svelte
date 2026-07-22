<script lang="ts">
  import { tabs, activeTabId } from '$lib/stores'
  import { switchToTab, closeTab } from '$lib/tabs'
  import { baseName } from '$lib/tauri'
</script>

{#if $tabs.length > 0}
  <div class="tabbar">
    {#each $tabs as tab (tab.id)}
      <div class="tab" class:active={tab.id === $activeTabId}>
        <button class="tab-open" onclick={() => switchToTab(tab.id)} title={tab.path}>
          <span class="tab-label">{baseName(tab.path)}</span>
          {#if tab.dirty}<span class="tab-dot" title="Unsaved"></span>{/if}
        </button>
        <button
          class="tab-close"
          onclick={() => closeTab(tab.id)}
          title="Close tab (Ctrl/Cmd+W)"
          aria-label="Close tab"
        >×</button>
      </div>
    {/each}
  </div>
{/if}
