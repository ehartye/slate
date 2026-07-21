<script lang="ts">
  import { onMount } from 'svelte'
  import { get } from 'svelte/store'
  import {
    EditorView, keymap, lineNumbers, highlightActiveLine, highlightActiveLineGutter,
  } from '@codemirror/view'
  import { EditorState, Compartment } from '@codemirror/state'
  import { defaultKeymap, history, historyKeymap } from '@codemirror/commands'
  import { syntaxHighlighting, HighlightStyle } from '@codemirror/language'
  import { tags as t } from '@lezer/highlight'
  import { markdown } from '@codemirror/lang-markdown'
  import { content, currentFile, dirty, editorScroll, reloadTrigger } from '$lib/stores'
  import { isMarkdownPath } from '$lib/fileKind'

  // Markdown source highlighting that follows the active theme via CSS variables.
  const mdHighlight = HighlightStyle.define([
    { tag: t.heading, color: 'var(--prose-heading)', fontWeight: 'bold' },
    { tag: t.strong, color: 'var(--code-tag)', fontWeight: 'bold' },
    { tag: t.emphasis, color: 'var(--code-fn)', fontStyle: 'italic' },
    { tag: t.strikethrough, textDecoration: 'line-through' },
    { tag: t.link, color: 'var(--prose-link)', textDecoration: 'underline' },
    { tag: t.url, color: 'var(--prose-link)' },
    { tag: t.monospace, color: 'var(--code-string)' },
    { tag: t.quote, color: 'var(--code-comment)', fontStyle: 'italic' },
    { tag: t.list, color: 'var(--accent)' },
    { tag: t.contentSeparator, color: 'var(--fg-muted)' },
    { tag: t.processingInstruction, color: 'var(--fg-muted)' },
    { tag: t.meta, color: 'var(--fg-muted)' },
  ])

  let host: HTMLDivElement
  let view: EditorView | null = null
  let lastLoaded: string | null = null
  let lastTrigger = 0

  // Non-markdown files are viewable but locked for editing (MD-only mode off
  // still lets you browse them; only .md/.markdown stays writable).
  const readOnlyCompartment = new Compartment()
  function readOnlyExtensions(readOnly: boolean) {
    return [EditorState.readOnly.of(readOnly), EditorView.editable.of(!readOnly)]
  }

  onMount(() => {
    view = new EditorView({
      parent: host,
      state: EditorState.create({
        doc: get(content),
        extensions: [
          lineNumbers(),
          highlightActiveLine(),
          highlightActiveLineGutter(),
          history(),
          keymap.of([...defaultKeymap, ...historyKeymap]),
          markdown(),
          syntaxHighlighting(mdHighlight),
          EditorView.lineWrapping,
          readOnlyCompartment.of(readOnlyExtensions(!isMarkdownPath(get(currentFile)))),
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

  // Swap the document (and re-lock/unlock editing) when the open file
  // changes OR an external reload is triggered.
  $effect(() => {
    const file = $currentFile
    const trigger = $reloadTrigger
    if (!view || (file === lastLoaded && trigger === lastTrigger)) return
    lastLoaded = file
    lastTrigger = trigger
    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: get(content) },
      effects: readOnlyCompartment.reconfigure(readOnlyExtensions(!isMarkdownPath(file))),
    })
  })

</script>

<div class="cm-host" bind:this={host}></div>
