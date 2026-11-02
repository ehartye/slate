import { afterEach, expect, it, vi } from 'vitest'
import { mount, unmount, flushSync } from 'svelte'
import AboutDialog from '../src/lib/components/AboutDialog.svelte'

vi.mock('../src/lib/tauri', () => ({ getBuildInfo: vi.fn().mockRejectedValue(new Error('frontend only')) }))
let component: ReturnType<typeof mount> | undefined
afterEach(async () => {
  if (component) await unmount(component)
  document.body.replaceChildren()
  vi.restoreAllMocks()
})

it('contains document shortcuts while preserving native keyboard defaults and selectable fallback', async () => {
  // jsdom does not implement the browser top layer. Native behavior is checked separately.
  HTMLDialogElement.prototype.showModal = function () { this.open = true }
  HTMLDialogElement.prototype.close = function () { this.open = false }
  const trigger = document.createElement('button')
  document.body.append(trigger)
  trigger.focus()
  component = mount(AboutDialog, { target: document.body, props: { onclose: vi.fn() } })
  flushSync()
  await Promise.resolve()
  flushSync()
  const dialog = document.querySelector('dialog')!
  const close = [...dialog.querySelectorAll('button')].find((button) => button.textContent === 'Close')!
  expect(document.activeElement).toBe(close)
  const backgroundShortcut = vi.fn()
  window.addEventListener('keydown', backgroundShortcut)
  try {
    for (const key of ['w', 's', 'f', 'Escape', 'Tab', 'c']) {
      const event = new KeyboardEvent('keydown', { key, ctrlKey: key.length === 1, bubbles: true, cancelable: true })
      close.dispatchEvent(event)
      expect(event.defaultPrevented).toBe(false)
    }
    expect(backgroundShortcut).not.toHaveBeenCalled()
    expect(dialog.textContent).toContain('Unknown')
    const copy = dialog.querySelector('button')!
    copy.click()
    await vi.waitFor(() => {
      flushSync()
      expect(dialog.textContent).toContain('Select the information above and copy it manually.')
    })
    expect(dialog.querySelector('dd.commit')?.textContent).toBe('Unknown')
    await unmount(component)
    component = undefined
    expect(document.activeElement).toBe(trigger)
  } finally {
    window.removeEventListener('keydown', backgroundShortcut)
  }
})
