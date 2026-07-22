import { describe, it, expect } from 'vitest'
import { EditorState, Annotation } from '@codemirror/state'

// Editor.svelte tags its programmatic "reload from disk" dispatch (manual
// refresh, or an external file-changed event) with a CodeMirror annotation,
// so its `updateListener` can tell that apart from a real user edit and skip
// marking the tab dirty for it. Before this, `view.dispatch(...)` for a
// reload was indistinguishable from typing — both fire the same
// `docChanged` update — which raced with refreshWorkspace()/the
// file-changed handler clearing `dirty` right before the dispatch: the
// listener's unconditional `dirty = true` clobbered it straight back,
// leaving the tab stuck showing unsaved changes for content that in fact
// exactly matched disk. These tests pin down the annotation mechanism the
// fix relies on, at the CodeMirror EditorState/Transaction level — no
// EditorView/DOM needed (and, per this repo's existing tests, none is
// mounted anywhere else either; @codemirror/view's EditorView requires
// browser APIs — MutationObserver, ResizeObserver — jsdom doesn't provide).
describe('CodeMirror reload-annotation mechanism (Editor.svelte)', () => {
  it('is absent on an ordinary (user-edit-shaped) transaction', () => {
    const marker = Annotation.define<boolean>()
    const state = EditorState.create({ doc: 'hello' })

    const tr = state.update({ changes: { from: 0, to: 5, insert: 'world' } })

    expect(tr.docChanged).toBe(true)
    expect(tr.annotation(marker)).toBeUndefined()
  })

  it('is present when the dispatch is tagged as a reload', () => {
    const marker = Annotation.define<boolean>()
    const state = EditorState.create({ doc: 'hello' })

    const tr = state.update({
      changes: { from: 0, to: 5, insert: 'world' },
      annotations: marker.of(true),
    })

    expect(tr.docChanged).toBe(true)
    expect(tr.annotation(marker)).toBe(true)
  })

  it('mirrors Editor.svelte\'s updateListener: only an untagged change marks dirty', () => {
    const marker = Annotation.define<boolean>()
    const state = EditorState.create({ doc: 'hello' })
    let dirty = false

    // Same shape as the listener installed in Editor.svelte's buildExtensions.
    function applyLikeUpdateListener(tr: ReturnType<typeof state.update>) {
      if (tr.docChanged) {
        const isReload = tr.annotation(marker)
        if (!isReload) dirty = true
      }
    }

    // A reload dispatch (annotated) must NOT flip dirty.
    applyLikeUpdateListener(state.update({ changes: { from: 0, to: 5, insert: 'world' }, annotations: marker.of(true) }))
    expect(dirty).toBe(false)

    // A real edit (unannotated) must still flip dirty.
    applyLikeUpdateListener(state.update({ changes: { from: 0, to: 5, insert: 'typed' } }))
    expect(dirty).toBe(true)
  })
})
