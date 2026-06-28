<script lang="ts">
  import { currentFile, dirty, statusMsg, previewZoom } from '$lib/stores'
  import { nudgeZoom, setZoom } from '$lib/zoom'
</script>

<footer class="statusbar">
  <span>{$currentFile ?? 'No file'}</span>
  <span class="spacer"></span>
  {#if $statusMsg}<span class="msg">{$statusMsg}</span>{/if}
  {#if $dirty}<span class="unsaved">● unsaved</span>{/if}
  <span class="zoom" title="Preview zoom (Ctrl +/− , Ctrl 0 to reset)">
    <button class="zoom-btn" onclick={() => nudgeZoom(-1)} aria-label="Zoom out">−</button>
    <button class="zoom-level" onclick={() => setZoom(1)} title="Reset to 100%">{Math.round($previewZoom * 100)}%</button>
    <button class="zoom-btn" onclick={() => nudgeZoom(1)} aria-label="Zoom in">+</button>
  </span>
  <span class="hint">Ctrl+S to save</span>
</footer>
