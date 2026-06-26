<script lang="ts">
  import { currentFile, currentFolder } from '$lib/stores'
  import { baseName } from '$lib/tauri'
</script>

<header class="toolbar">
  <strong>{$currentFile ? baseName($currentFile) : 'Slate'}</strong>
  {#if $currentFolder}<span class="muted">— {$currentFolder}</span>{/if}
  <span class="spacer"></span>
</header>
