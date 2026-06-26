<script lang="ts">
  import { currentFile, dirty, statusMsg } from '$lib/stores'
</script>

<footer class="statusbar">
  <span>{$currentFile ?? 'No file'}</span>
  <span class="spacer"></span>
  {#if $statusMsg}<span class="msg">{$statusMsg}</span>{/if}
  {#if $dirty}<span class="unsaved">● unsaved</span>{/if}
  <span class="hint">Ctrl+S to save</span>
</footer>
