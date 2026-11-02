<script lang="ts">
  import { onMount } from 'svelte'
  import { copyBuildInfo, loadBuildInfo, trackedStateLabel, unknownBuildInfo } from '$lib/buildInfo'

  let { onclose }: { onclose: () => void } = $props()
  let dialog: HTMLDialogElement
  let closeButton: HTMLButtonElement
  let info = $state({ ...unknownBuildInfo })
  let message = $state('')
  let copying = $state(false)

  onMount(() => {
    const trigger = document.activeElement
    dialog.showModal()
    closeButton.focus()
    let mounted = true
    void loadBuildInfo().then((value) => { if (mounted) info = value })
    return () => {
      mounted = false
      dialog.close()
      if (trigger instanceof HTMLElement && trigger.isConnected) trigger.focus()
    }
  })

  async function copy() {
    copying = true
    message = ''
    message = await copyBuildInfo(info)
    copying = false
  }
</script>

<!-- Keep document shortcuts out of the modal, retaining native Tab/Escape/copy defaults. -->
<dialog bind:this={dialog} aria-labelledby="about-title" onclose={onclose}
  onkeydown={(event) => event.stopPropagation()}>
  <h2 id="about-title">About Slate</h2>
  <dl>
    <dt>Version</dt><dd>{info.version}</dd>
    <dt>Commit</dt><dd class="commit">{info.commit ?? 'Unknown'}</dd>
    <dt>Tracked changes</dt><dd>{trackedStateLabel(info.trackedState)}</dd>
  </dl>
  <p class="feedback" role="status">{message}</p>
  <footer>
    <button onclick={copy} disabled={copying}>Copy build info</button>
    <button bind:this={closeButton} class="close" onclick={() => dialog.close()}>Close</button>
  </footer>
</dialog>

<style>
  dialog {
    width: min(30rem, calc(100vw - 3rem));
    box-sizing: border-box;
    max-height: calc(100vh - 3rem);
    overflow: auto;
    padding: 1.5rem;
    color: var(--fg);
    background: var(--bg-elevated);
    border: 1px solid var(--border);
    border-top: 3px solid var(--accent);
    border-radius: 12px;
    font: inherit;
  }
  dialog::backdrop { background: rgb(0 0 0 / 45%); }
  h2 { margin: 0 0 1.5rem; font-size: 1.3rem; }
  dl { margin: 0; user-select: text; }
  dt { color: var(--fg-muted); font-size: 0.8rem; margin-top: 1rem; }
  dd { margin: 0.35rem 0 0; }
  .commit { font-family: var(--font-mono, monospace); overflow-wrap: anywhere; font-size: 0.85rem; }
  .feedback { min-height: 2.5em; margin: 1.25rem 0 0.75rem; font-size: 0.85rem; }
  footer { display: flex; justify-content: flex-end; flex-wrap: wrap; gap: 0.6rem; }
  button { font: inherit; color: var(--fg); background: var(--bg); border: 1px solid var(--border); border-radius: 6px; padding: 0.5rem 0.8rem; cursor: pointer; }
  button:hover { border-color: var(--accent); }
  button:focus-visible { outline: 2px solid var(--accent); outline-offset: 3px; }
  button:disabled { opacity: 0.6; cursor: wait; }
  .close { border-color: var(--accent); }
</style>
