import { get } from 'svelte/store'
import { listen } from '@tauri-apps/api/event'
import { invoke, isTauri } from '@tauri-apps/api/core'
import { activeTabId, tabs, dirty, content, documentRevision } from './stores'
import { mutationsFrozen, freezeForUpdate, releaseUpdateFreeze } from './mutationGate'
export { mutationsFrozen, freezeForUpdate, releaseUpdateFreeze } from './mutationGate'

let pendingWrites = 0
const saving = new Set<string>()
export function safetySnapshot() {
  const active = get(activeTabId)
  return { dirty: get(dirty) || get(tabs).some(t => t.id !== active && t.dirty), pendingWrites }
}
export async function saveActiveDocument(write: (path: string, text: string) => Promise<void>) {
  if (mutationsFrozen()) throw new Error('Update installation in progress')
  const id = get(activeTabId), tab = get(tabs).find(t => t.id === id)
  if (!id || !tab || saving.has(id)) return
  const revision = documentRevision(id), text = get(content)
  saving.add(id); pendingWrites++
  try {
    await write(tab.path, text)
    if (documentRevision(id) === revision) {
      tabs.update(ts => ts.map(t => t.id === id ? { ...t, dirty: false } : t))
      if (get(activeTabId) === id) dirty.set(false)
    }
  } finally { saving.delete(id); pendingWrites-- }
}

/** Installed in every window, independently of whether About is open. */
export async function registerUpdateSafety(register: (cleanup: () => void) => void) {
  if (!isTauri()) return
  register(await listen<{ attempt: number }>('update-release', ({ payload }) => releaseUpdateFreeze(payload.attempt)))
  register(await listen<{ attempt: number }>('update-prepare', ({ payload }) => {
    if (!freezeForUpdate(payload.attempt)) return
    const snapshot = safetySnapshot()
    invoke('ack_update_safety', { attempt: payload.attempt, ...snapshot }).catch(() => {
      // Native timeout owns unfreezing; never release a possibly committed guard locally.
    })
  }))
}
