import { afterEach, expect, it } from 'vitest'
import { mount, unmount, flushSync } from 'svelte'
import { get } from 'svelte/store'
import { EditorView } from '@codemirror/view'
import { undo } from '@codemirror/commands'
import Editor from '../src/lib/components/Editor.svelte'
import { tabs, activeTabId, currentFile, setTabText, content, dirty } from '../src/lib/stores'
import { freezeForUpdate, releaseUpdateFreeze, safetySnapshot } from '../src/lib/updateSafety'

let component: ReturnType<typeof mount> | undefined
afterEach(async () => {
  if (component) await unmount(component)
  component = undefined
  releaseUpdateFreeze()
  document.body.replaceChildren()
})

it('blocks real editor typing, paste and undo transactions after a clean freeze acknowledgment', () => {
  releaseUpdateFreeze()
  tabs.set([{ id: 'editor-update', path: 'a.md', dirty: false, scrollFraction: 0, needsReload: false }])
  activeTabId.set('editor-update'); currentFile.set('a.md'); setTabText('editor-update', 'original'); dirty.set(false)
  component = mount(Editor, { target: document.body })
  flushSync()
  const view = EditorView.findFromDOM(document.querySelector('.cm-editor') as HTMLElement)!
  expect(view).toBeTruthy()
  view.dispatch({ changes: { from: 0, insert: 'saved ' }, userEvent: 'input.type' })
  dirty.set(false)
  freezeForUpdate(22)
  expect(safetySnapshot()).toEqual({ dirty: false, pendingWrites: 0 })
  for (const userEvent of ['input.type', 'input.paste']) {
    view.dispatch({ changes: { from: 0, insert: 'blocked ' }, userEvent })
  }
  undo(view)
  expect(view.state.doc.toString()).toBe('saved original')
  expect(get(content)).toBe('saved original')
  expect(get(dirty)).toBe(false)
  releaseUpdateFreeze(22)
  view.dispatch({ changes: { from: 0, insert: 'allowed ' }, userEvent: 'input.type' })
  expect(get(content)).toBe('allowed saved original')
  expect(get(dirty)).toBe(true)
})
