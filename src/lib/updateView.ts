import { isTauri } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { getUpdateStatus, checkForUpdates, downloadUpdate, installUpdate, type UpdateStatus } from './tauri'

export const unavailableUpdate: UpdateStatus = {
  phase: 'unavailable', version: null, notes: '', downloadedBytes: 0, totalBytes: null,
  message: 'Update checking is unavailable in this build.',
}
export const updateBusy = (status: UpdateStatus) => ['checking', 'downloading', 'preparing', 'installing'].includes(status.phase)
export function bytesLabel(bytes: number): string {
  if (bytes < 1024) return `${bytes} bytes`
  const unit = bytes < 1024 * 1024 ? 1024 : 1024 * 1024
  return `${Number((bytes / unit).toFixed(1))} ${unit === 1024 ? 'KiB' : 'MiB'}`
}
export function updateMessage(status: UpdateStatus): string {
  if (status.message) return status.message
  switch (status.phase) {
    case 'checking': return 'Checking for Preview updates…'
    case 'available': return `Slate ${status.version} is available.`
    case 'downloading': return status.totalBytes && status.totalBytes > 0
      ? `${bytesLabel(status.downloadedBytes)} of ${bytesLabel(status.totalBytes)} downloaded`
      : `${bytesLabel(status.downloadedBytes)} downloaded`
    case 'downloaded': return 'Update downloaded. Save changes in every window before installing.'
    case 'preparing': return 'Checking that every window is ready to restart…'
    case 'installing': return 'Installing update and restarting Slate…'
    default: return ''
  }
}

/** A view of the native service; mounting only reads status, never checks or installs. */
export function createUpdateView(show: (status: UpdateStatus) => void) {
  let disposed = false
  let revision = 0
  let stop: (() => void) | undefined
  let current = { ...unavailableUpdate }
  const set = (value: UpdateStatus) => { if (!disposed) { current = value; show(value) } }
  return {
    async start() {
      if (!isTauri()) { set({ ...unavailableUpdate }); return }
      try {
        const unlisten = await listen<UpdateStatus>('update-status', ({ payload }) => { revision++; set(payload) })
        if (disposed) { unlisten(); return }
        stop = unlisten
        const started = revision
        const snapshot = await getUpdateStatus()
        // An event received during the request is newer than its snapshot.
        if (revision === started) set(snapshot)
      } catch {
        if (revision === 0) set({ ...unavailableUpdate })
      }
    },
    async run(action: 'check' | 'download' | 'install') {
      const started = revision
      try {
        const value = await ({ check: checkForUpdates, download: downloadUpdate, install: installUpdate })[action]()
        if (revision === started) set(value)
      } catch {
        if (revision === started) set({ ...current, phase: 'error', message: {
          check: 'Could not check for updates. Retry the check.',
          download: 'Could not download the update. Retry the download.',
          install: 'Could not start installation. Check the update status and retry.',
        }[action] })
      }
    },
    dispose() { disposed = true; stop?.() },
  }
}
