import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { mount, unmount, flushSync } from 'svelte'
import AboutDialog from '../src/lib/components/AboutDialog.svelte'
import type { UpdateStatus } from '../src/lib/tauri'

const mocks = vi.hoisted(() => ({ native: true, get: vi.fn(), check: vi.fn(), download: vi.fn(), install: vi.fn(), listen: vi.fn(), stop: vi.fn() }))
vi.mock('@tauri-apps/api/core', () => ({ isTauri: () => mocks.native }))
vi.mock('@tauri-apps/api/event', () => ({ listen: mocks.listen }))
vi.mock('../src/lib/tauri', () => ({
  getBuildInfo: vi.fn(async () => ({ version: '0.2.0-alpha.1', commit: 'abc123', trackedState: 'clean' })),
  getUpdateStatus: mocks.get, checkForUpdates: mocks.check, downloadUpdate: mocks.download, installUpdate: mocks.install,
}))
const status = (phase: UpdateStatus['phase'], extra: Partial<UpdateStatus> = {}): UpdateStatus => ({ phase, version: null, notes: '', downloadedBytes: 0, totalBytes: null, message: '', ...extra })
let component: ReturnType<typeof mount> | undefined
let emit: (value: UpdateStatus) => void
const button = (text: string) => [...document.querySelectorAll('button')].find(b => b.textContent?.trim() === text)!
async function render() {
  component = mount(AboutDialog, { target: document.body, props: { onclose: vi.fn() } })
  await vi.waitFor(() => { flushSync(); expect(document.body.textContent).toContain('Preview') })
  await Promise.resolve(); flushSync()
}
beforeEach(() => {
  vi.clearAllMocks(); mocks.native = true
  mocks.get.mockResolvedValue(status('idle'))
  mocks.listen.mockImplementation(async (_: string, listener: (e: { payload: UpdateStatus }) => void) => { emit = value => { listener({ payload: value }); flushSync() }; return mocks.stop })
  HTMLDialogElement.prototype.showModal = function () { this.open = true }
  HTMLDialogElement.prototype.close = function () { this.open = false }
})
afterEach(async () => { if (component) await unmount(component); component = undefined; document.body.replaceChildren() })

it('requires explicit check, download and install actions and renders notes as text', async () => {
  mocks.check.mockResolvedValue(status('available', { version: '0.2.0-alpha.2', notes: '<img src=x onerror=alert(1)>\nPreview notes' }))
  mocks.download.mockResolvedValue(status('downloaded', { version: '0.2.0-alpha.2' }))
  mocks.install.mockResolvedValue(status('installing', { version: '0.2.0-alpha.2' }))
  await render()
  expect(mocks.check).not.toHaveBeenCalled(); expect(mocks.download).not.toHaveBeenCalled(); expect(mocks.install).not.toHaveBeenCalled()
  button('Check for updates').click()
  await vi.waitFor(() => { flushSync(); expect(button('Download update')).toBeTruthy() })
  expect(document.body.textContent).toContain('<img src=x onerror=alert(1)>'); expect(document.querySelector('img')).toBeNull()
  button('Download update').click()
  await vi.waitFor(() => { flushSync(); expect(button('Install and restart')).toBeTruthy() })
  expect(mocks.install).not.toHaveBeenCalled()
  button('Install and restart').click()
  await vi.waitFor(() => { flushSync(); expect(document.body.textContent).toContain('Installing update') })
  expect(mocks.check).toHaveBeenCalledTimes(1); expect(mocks.download).toHaveBeenCalledTimes(1); expect(mocks.install).toHaveBeenCalledTimes(1)
})
it('shows shared progress without inventing a percentage and retains a downloaded update on reopen', async () => {
  await render()
  emit(status('downloading', { downloadedBytes: 2048 }))
  expect(document.body.textContent).toContain('2 KiB downloaded'); expect(document.body.textContent).not.toContain('%')
  emit(status('downloading', { downloadedBytes: 2048, totalBytes: 4096 }))
  expect(document.querySelector('progress')?.value).toBe(2048)
  await unmount(component!); component = undefined; expect(mocks.stop).toHaveBeenCalledTimes(1)
  mocks.get.mockResolvedValue(status('downloaded', { version: '0.2.0-alpha.2' }))
  await render(); expect(button('Install and restart')).toBeTruthy(); expect(mocks.install).not.toHaveBeenCalled()
})
it.each(['noRelease', 'upToDate', 'error'] as const)('shows %s feedback and permits a fresh explicit check', async phase => {
  mocks.get.mockResolvedValue(status(phase, { message: `Native ${phase} feedback` }))
  await render(); expect(document.body.textContent).toContain(`Native ${phase} feedback`)
  expect(button('Check for updates').disabled).toBe(false)
})
it('retries a failed download and preserves the all-window safety message', async () => {
  mocks.get.mockResolvedValue(status('error', { version: '0.2.0-alpha.2', message: 'Update download failed. Retry the download.' }))
  mocks.download.mockResolvedValue(status('downloaded', { version: '0.2.0-alpha.2', message: 'Save changes in all windows before installing, then retry.' }))
  await render(); button('Download update').click()
  await vi.waitFor(() => { flushSync(); expect(document.body.textContent).toContain('Save changes in all windows') })
  expect(button('Install and restart')).toBeTruthy()
})
it('keeps the three-line clipboard contract and waits for clipboard success', async () => {
  let finish!: () => void
  const writeText = vi.fn(() => new Promise<void>(r => { finish = r }))
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } })
  await render(); button('Copy build info').click(); flushSync()
  expect(document.body.textContent).not.toContain('Build info copied.')
  expect(writeText).toHaveBeenCalledWith('Slate: 0.2.0-alpha.1\nCommit: abc123\nTracked changes: Clean')
  finish(); await vi.waitFor(() => { flushSync(); expect(document.body.textContent).toContain('Build info copied.') })
})
it('degrades gracefully in frontend-only operation without invoking native updates', async () => {
  mocks.native = false
  await render(); expect(document.body.textContent).toContain('Update checking is unavailable')
  expect(mocks.get).not.toHaveBeenCalled(); expect(mocks.listen).not.toHaveBeenCalled(); expect(button('Check for updates')).toBeUndefined()
})
it('catches status and action invocation failures', async () => {
  mocks.get.mockRejectedValue(new Error('native unavailable'))
  await render(); expect(document.body.textContent).toContain('Update checking is unavailable')
  await unmount(component!); component = undefined
  mocks.get.mockResolvedValue(status('idle')); mocks.check.mockRejectedValue(new Error('IPC failure'))
  await render(); button('Check for updates').click()
  await vi.waitFor(() => { flushSync(); expect(document.body.textContent).toContain('Could not check for updates') })
  expect(button('Check for updates').disabled).toBe(false)
})
it('does not let a delayed status snapshot overwrite a newer shared update event', async () => {
  let resolve!: (value: UpdateStatus) => void
  mocks.get.mockImplementation(() => new Promise<UpdateStatus>(r => { resolve = r }))
  await render()
  emit(status('downloaded', { version: '0.2.0-alpha.2' }))
  resolve(status('idle')); await Promise.resolve(); flushSync()
  expect(button('Install and restart')).toBeTruthy()
})
it('cleans up a subscription that finishes after About closes', async () => {
  let resolve!: (stop: () => void) => void
  mocks.listen.mockImplementation(() => new Promise<() => void>(r => { resolve = r }))
  await render(); await unmount(component!); component = undefined
  resolve(mocks.stop); await Promise.resolve()
  expect(mocks.stop).toHaveBeenCalledOnce(); expect(mocks.get).not.toHaveBeenCalled()
})
