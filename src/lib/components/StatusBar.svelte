<script lang="ts">
  import { currentFile, dirty, statusMsg, previewZoom } from '$lib/stores'
  import { nudgeZoom, setZoom } from '$lib/zoom'
  import { isMarkdownPath } from '$lib/fileKind'

  let readOnly = $derived($currentFile !== null && !isMarkdownPath($currentFile))
</script>

<footer class="statusbar">
  <span>{$currentFile ?? 'No file'}</span>
  <span class="spacer"></span>
  {#if $statusMsg}<span class="msg">{$statusMsg}</span>{/if}
  {#if readOnly}
    <span class="readonly" title="Only markdown files can be edited">read-only</span>
  {/if}
  {#if $dirty}<span class="unsaved">● unsaved</span>{/if}
  <span class="zoom" title="Preview zoom (Ctrl +/− , Ctrl 0 to reset)">
    <button class="zoom-btn" onclick={() => nudgeZoom(-1)} aria-label="Zoom out">−</button>
    <button class="zoom-level" onclick={() => setZoom(1)} title="Reset to 100%">{Math.round($previewZoom * 100)}%</button>
    <button class="zoom-btn" onclick={() => nudgeZoom(1)} aria-label="Zoom in">+</button>
  </span>
  {#if !readOnly}<span class="hint">Ctrl+S to save</span>{/if}
</footer>
