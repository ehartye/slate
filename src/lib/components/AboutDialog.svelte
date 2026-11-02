<script lang="ts">
  import { onMount } from 'svelte'
  import { copyBuildInfo, loadBuildInfo, trackedStateLabel, unknownBuildInfo } from '$lib/buildInfo'
  import { createUpdateView, unavailableUpdate, updateBusy, updateMessage } from '$lib/updateView'

  let { onclose }: { onclose: () => void } = $props()
  let dialog: HTMLDialogElement
  let closeButton: HTMLButtonElement
  let info = $state({ ...unknownBuildInfo })
  let message = $state('')
  let copying = $state(false)
  let update = $state({ ...unavailableUpdate })
  let invoking = $state(false)
  const updates = createUpdateView(value => { update = value })
  const busy = $derived(invoking || updateBusy(update))

  onMount(() => {
    const trigger = document.activeElement
    dialog.showModal()
    closeButton.focus()
    let mounted = true
    void loadBuildInfo().then((value) => { if (mounted) info = value })
    void updates.start()
    return () => {
      mounted = false
      updates.dispose()
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

  async function updateAction(action: 'check' | 'download' | 'install') {
    if (busy) return
    invoking = true
    try { await updates.run(action) } finally { invoking = false }
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
  <section class="updates" aria-labelledby="updates-title">
    <h3 id="updates-title">Channel: <span>Preview</span></h3>
    {#if update.version}<p class="offered">Update: {update.version}</p>{/if}
    <p class="update-feedback" role="status" aria-atomic="true">{updateMessage(update)}</p>
    {#if update.phase === 'downloading' && update.totalBytes && update.totalBytes > 0}
      <progress aria-label="Update download" max={update.totalBytes} value={update.downloadedBytes}></progress>
    {/if}
    {#if update.notes}<div class="release-notes" aria-label="Release notes">{update.notes}</div>{/if}
    <div class="update-actions">
      {#if update.phase !== 'unavailable'}
        <button onclick={() => updateAction('check')} disabled={busy}>Check for updates</button>
      {/if}
      {#if update.phase === 'available' || (update.phase === 'error' && update.version)}
        <button class="primary" onclick={() => updateAction('download')} disabled={busy}>Download update</button>
      {/if}
      {#if update.phase === 'downloaded'}
        <button class="primary" onclick={() => updateAction('install')} disabled={busy}>Install and restart</button>
      {/if}
    </div>
  </section>
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
  .updates { margin-top: 1.5rem; padding-top: 1.1rem; border-top: 1px solid var(--border); }
  h3 { margin: 0; color: var(--fg-muted); font-size: 0.85rem; font-weight: normal; }
  h3 span { color: var(--fg); font-weight: 600; }
  .offered { margin: 0.75rem 0 0; font-family: var(--font-mono, monospace); font-size: 0.85rem; overflow-wrap: anywhere; }
  .update-feedback { margin: 0.75rem 0; font-size: 0.85rem; line-height: 1.5; }
  .release-notes { max-height: 9rem; overflow: auto; white-space: pre-wrap; overflow-wrap: anywhere; font-size: 0.85rem; line-height: 1.5; margin: 0.75rem 0; user-select: text; }
  .update-actions { display: flex; flex-wrap: wrap; gap: 0.6rem; }
  progress { display: block; width: 100%; height: 0.5rem; accent-color: var(--accent); margin: 0.75rem 0; }
  .feedback { min-height: 2.5em; margin: 1.25rem 0 0.75rem; font-size: 0.85rem; }
  footer { display: flex; justify-content: flex-end; flex-wrap: wrap; gap: 0.6rem; }
  button { font: inherit; color: var(--fg); background: var(--bg); border: 1px solid var(--border); border-radius: 6px; padding: 0.5rem 0.8rem; cursor: pointer; }
  button:hover { border-color: var(--accent); }
  button:focus-visible { outline: 2px solid var(--accent); outline-offset: 3px; }
  button:disabled { opacity: 0.6; cursor: wait; }
  .close { border-color: var(--accent); }
  .primary { border-color: var(--accent); }
</style>
