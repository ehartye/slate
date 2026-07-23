import { describe, it, expect } from 'vitest'
import { EditorState, Compartment } from '@codemirror/state'

// Editor.svelte reserves a Compartment slot for the current tab's language
// support, swapped in asynchronously once @codemirror/language-data resolves
// and dynamically imports the matching @codemirror/lang-* package for the
// open file's extension (loadLanguageFor). For a tab that's gone to the
// background before that resolves, the swap has to happen on the *cached*
// EditorState object directly (no live EditorView to dispatch through) via
// `state.update({ effects: compartment.reconfigure(...) }).state` — these
// tests pin down that exact mechanism at the EditorState/Transaction level,
// mirroring editorReload.test.ts's approach (no EditorView/DOM needed, and
// per this repo's existing tests, none is mounted anywhere else either).
//
// Stands-in for "extension A" / "extension B" use EditorState.tabSize.of(n)
// — a real, trivial built-in facet-backed extension — rather than an actual
// language package (@codemirror/lang-python etc.), since CodeMirror
// validates that every extension in the tree is a genuine recognized
// extension object at runtime (a plain string/marker value throws
// "Unrecognized extension value"), and what's actually being verified here
// is the swap mechanism itself, not any particular language's behavior.
describe('CodeMirror language Compartment mechanism (Editor.svelte)', () => {
  it('starts with whatever extension it was created with', () => {
    const compartment = new Compartment()
    const state = EditorState.create({ doc: 'x', extensions: [compartment.of(EditorState.tabSize.of(2))] })

    expect(state.facet(EditorState.tabSize)).toBe(2)
  })

  it('reconfigure() via a dispatched-style update swaps the slot content', () => {
    const compartment = new Compartment()
    const state = EditorState.create({ doc: 'x', extensions: [compartment.of(EditorState.tabSize.of(2))] })

    // Mirrors the live-view path: view.dispatch({ effects: ... }).
    const tr = state.update({ effects: compartment.reconfigure(EditorState.tabSize.of(8)) })

    expect(tr.state.facet(EditorState.tabSize)).toBe(8)
    // The original state object is untouched — CodeMirror states are immutable.
    expect(state.facet(EditorState.tabSize)).toBe(2)
  })

  it('reconfigure() applied directly to a cached (non-live) state works the same way', () => {
    // Mirrors loadLanguageFor's background-tab branch: no EditorView
    // involved at all, just state.update(...).state on a state object
    // pulled out of the editorStates cache.
    const compartment = new Compartment()
    const cached = EditorState.create({ doc: 'print(1)', extensions: [compartment.of([])] })

    const updated = cached.update({ effects: compartment.reconfigure(EditorState.tabSize.of(8)) }).state

    expect(updated.facet(EditorState.tabSize)).toBe(8)
    expect(updated.doc.toString()).toBe('print(1)') // document content itself is unaffected
  })

  it('an empty initial slot (unrecognized-extension file) can still be reconfigured later', () => {
    // Mirrors buildExtensions' langCompartment.of(isMarkdownPath(path) ?
    // markdown() : []) for a non-markdown file: starts empty, not absent.
    const compartment = new Compartment()
    const state = EditorState.create({ doc: 'x', extensions: [compartment.of([])] })

    expect(compartment.get(state)).toEqual([])

    const updated = state.update({ effects: compartment.reconfigure(EditorState.tabSize.of(4)) }).state
    expect(updated.facet(EditorState.tabSize)).toBe(4)
  })
})

