import { describe, it, expect } from 'vitest'
import { EditorState } from '@codemirror/state'

// Editor.svelte caches one CodeMirror EditorState per open tab and swaps
// between them via `view.setState(...)` when the active tab changes. That
// cache is *only* a cache: a tab's actual document lives in stores.ts's
// `tabDocs`, and `content` is a view of whichever tab is active.
//
// This matters because the cached state can go stale — tabs.ts reloads a
// background tab's document from disk when an external change arrives — and
// because `view.setState` does NOT fire the `EditorView.updateListener`
// extension the way a real `view.dispatch(...)` does (confirmed in
// @codemirror/view's source: `setState` tears down and rebuilds plugins
// without ever invoking the update-listener facet), so a switch can't be
// relied on to write anything back.
//
// So on every switch Editor.svelte validates the cached state against the
// tab's document and rebuilds when they disagree, rather than coordinating
// with tabs.ts through a `needsReload` flag handshake (which is what this
// replaced — a handshake has a window where the two modules disagree about
// what the document says and each is waiting on the other). These tests pin
// down that validation rule at the EditorState level, no EditorView/DOM
// needed (and, per this repo's existing tests, none is mounted elsewhere
// either).

/** Mirrors Editor.svelte's tab-switch branch: reuse the cached state only
 *  while it still agrees with the tab's document, otherwise rebuild. */
function resolveStateForSwitch(
  editorStates: Map<string, EditorState>,
  tabId: string,
  text: string,
): EditorState {
  let state = editorStates.get(tabId)
  if (state && state.doc.toString() !== text) state = undefined
  if (!state) {
    state = EditorState.create({ doc: text })
    editorStates.set(tabId, state)
  }
  return state
}

describe('per-tab EditorState resolution across tab switches (Editor.svelte)', () => {
  it('reuses the cached state when it still matches the tab\'s document', () => {
    const editorStates = new Map<string, EditorState>()
    const cached = EditorState.create({ doc: 'content of file A' })
    editorStates.set('tab-1', cached)

    const resolved = resolveStateForSwitch(editorStates, 'tab-1', 'content of file A')

    // Same object, not a rebuild — undo history, cursor and selection survive.
    expect(resolved).toBe(cached)
  })

  it('discards a cached state whose document changed on disk while backgrounded', () => {
    const editorStates = new Map<string, EditorState>()
    const cached = EditorState.create({ doc: 'original text' })
    editorStates.set('tab-1', cached)

    // tabs.ts reloaded this tab from disk while it was inactive.
    const resolved = resolveStateForSwitch(editorStates, 'tab-1', 'text from disk')

    expect(resolved).not.toBe(cached)
    expect(resolved.doc.toString()).toBe('text from disk')
    expect(editorStates.get('tab-1')).toBe(resolved) // and the cache is refreshed
  })

  it('keeps a cached tab\'s unsaved edits (its document tracks every keystroke)', () => {
    const editorStates = new Map<string, EditorState>()
    const original = EditorState.create({ doc: 'original text' })
    // The user typed into tab-1 before switching away. Editor.svelte's
    // updateListener wrote each keystroke through to the tab's document, so
    // the two still agree and the edited state is reused as-is.
    const edited = original.update({ changes: { from: 0, to: 8, insert: 'modified' } }).state
    editorStates.set('tab-1', edited)

    const resolved = resolveStateForSwitch(editorStates, 'tab-1', 'modified text')

    expect(resolved).toBe(edited)
    expect(resolved.doc.toString()).toBe('modified text')
  })

  it('builds a fresh state for a tab that has never been shown in the editor', () => {
    const editorStates = new Map<string, EditorState>()

    // e.g. the editor pane was collapsed when this tab was opened, so it was
    // never mounted to cache anything for it.
    const resolved = resolveStateForSwitch(editorStates, 'tab-9', 'content of file B')

    expect(resolved.doc.toString()).toBe('content of file B')
  })

  it('switching A -> B -> A always lands on each tab\'s own text', () => {
    const editorStates = new Map<string, EditorState>()
    const docs = new Map([['tab-1', 'content of file A'], ['tab-2', 'content of file B']])
    const switchTo = (id: string) => resolveStateForSwitch(editorStates, id, docs.get(id)!).doc.toString()

    expect(switchTo('tab-1')).toBe('content of file A')
    expect(switchTo('tab-2')).toBe('content of file B')
    expect(switchTo('tab-1')).toBe('content of file A')
  })
})
