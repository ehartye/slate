<script lang="ts">
  import { onMount } from 'svelte'
  import { get } from 'svelte/store'
  import { EditorView, keymap } from '@codemirror/view'
  import { EditorState } from '@codemirror/state'
  import { defaultKeymap, history, historyKeymap } from '@codemirror/commands'
  import { markdown } from '@codemirror/lang-markdown'
  import { content, currentFile, dirty, editorScroll } from '$lib/stores'

  let host: HTMLDivElement
  let view: EditorView | null = null
  let lastLoaded: string | null = null

  onMount(() => {
    view = new EditorView({
      parent: host,
      state: EditorState.create({
        doc: get(content),
        extensions: [
          history(),
          keymap.of([...defaultKeymap, ...historyKeymap]),
          markdown(),
          EditorView.lineWrapping,
          EditorView.updateListener.of((u) => {
            if (u.docChanged) {
              content.set(u.state.doc.toString())
              dirty.set(true)
            }
          }),
        ],
      }),
    })
    lastLoaded = get(currentFile)
    const onScroll = () => {
      const el = view!.scrollDOM
      const max = el.scrollHeight - el.clientHeight
      editorScroll.set(max > 0 ? el.scrollTop / max : 0)
    }
    view.scrollDOM.addEventListener('scroll', onScroll)
    return () => {
      view?.scrollDOM.removeEventListener('scroll', onScroll)
      view?.destroy()
    }
  })

  // Swap the document only when the open file changes (not on every keystroke).
  $effect(() => {
    const file = $currentFile
    if (!view || file === lastLoaded) return
    lastLoaded = file
    view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: get(content) } })
  })
</script>

<div class="cm-host" bind:this={host}></div>
