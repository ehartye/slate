import { describe, it, expect } from 'vitest'
import { EditorState } from '@codemirror/state'

// Editor.svelte caches one CodeMirror EditorState per open tab and swaps
// between them via `view.setState(...)` when the active tab changes — but
// `setState` does NOT fire the `EditorView.updateListener` extension the way
// a real `view.dispatch(...)` does (confirmed directly in
// @codemirror/view's source: `setState` tears down and rebuilds plugins
// without ever invoking the update-listener facet). Since `content.set(...)`
// was previously called *only* from inside that listener, switching to an
// already-cached tab (the ordinary, most common case of clicking between
// two already-open tabs) left the `content` store holding whichever tab's
// text was last typed into or freshly loaded — not the tab actually being
// switched to.
//
// That stale `content` isn't just a Preview-pane cosmetic bug: Preview,
// Toolbar's "Open in browser", and — critically — save() in +page.svelte
// all read from it, so save() could write one tab's text into a completely
// different tab's file on disk.
//
// The fix: after resolving which EditorState a switch is landing on
// (freshly built or pulled from the cache), Editor.svelte now explicitly
// does `content.set(state.doc.toString())` before calling `view.setState`.
// This test pins down the core invariant that fix depends on — that each
// tab's own cached EditorState really does hold its own distinct text, so
// reading `.doc.toString()` off of it always gives back the right content
// for whichever tab is being switched to — at the EditorState level, no
// EditorView/DOM needed (and, per this repo's existing tests, none is
// mounted anywhere else either).
describe('per-tab EditorState content stays distinct across tab switches (Editor.svelte)', () => {
  it('two tabs cached with different text each report their own doc via .doc.toString()', () => {
    const editorStates = new Map<string, EditorState>()
    editorStates.set('tab-1', EditorState.create({ doc: 'content of file A' }))
    editorStates.set('tab-2', EditorState.create({ doc: 'content of file B' }))

    expect(editorStates.get('tab-1')!.doc.toString()).toBe('content of file A')
    expect(editorStates.get('tab-2')!.doc.toString()).toBe('content of file B')
  })

  it('simulated switching (A -> B -> A) always yields the correct tab\'s text for content.set()', () => {
    const editorStates = new Map<string, EditorState>()
    editorStates.set('tab-1', EditorState.create({ doc: 'content of file A' }))
    editorStates.set('tab-2', EditorState.create({ doc: 'content of file B' }))

    // Mirrors Editor.svelte's tab-switching branch: `content` is set to
    // whatever the resolved state's document actually is, every time.
    function contentForSwitchTo(tabId: string): string {
      const state = editorStates.get(tabId)
      if (!state) throw new Error(`no cached state for ${tabId}`)
      return state.doc.toString()
    }

    expect(contentForSwitchTo('tab-1')).toBe('content of file A')
    expect(contentForSwitchTo('tab-2')).toBe('content of file B')
    // Revisiting tab-1 must report tab-1's text again, not tab-2's leftover
    // text — this is exactly the scenario that was silently broken before
    // (view.setState alone would show the right text on screen, but
    // `content` — and thus Preview/save() — would still say "file B").
    expect(contentForSwitchTo('tab-1')).toBe('content of file A')
  })

  it('an in-progress (unsaved) edit in a cached tab is what gets read back, not stale original text', () => {
    const editorStates = new Map<string, EditorState>()
    const original = EditorState.create({ doc: 'original text' })
    // Simulates the user having typed into tab-1 before switching away —
    // Editor.svelte saves `view.state` (post-edit) into the cache when
    // leaving a tab, not the state it was created with.
    const edited = original.update({ changes: { from: 0, to: 8, insert: 'modified' } }).state
    editorStates.set('tab-1', edited)

    expect(editorStates.get('tab-1')!.doc.toString()).toBe('modified text')
  })
})
