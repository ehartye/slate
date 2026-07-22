<script lang="ts">
  import { onMount } from 'svelte'
  import { get } from 'svelte/store'
  import {
    EditorView, keymap, lineNumbers, highlightActiveLine, highlightActiveLineGutter,
  } from '@codemirror/view'
  import { EditorState } from '@codemirror/state'
  import { defaultKeymap, history, historyKeymap } from '@codemirror/commands'
  import { syntaxHighlighting, HighlightStyle } from '@codemirror/language'
  import { tags as t } from '@lezer/highlight'
  import { markdown } from '@codemirror/lang-markdown'
  import {
    content, currentFile, dirty, editorScroll, reloadTrigger, activeTabId, tabs,
  } from '$lib/stores'
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

  // One CodeMirror EditorState per open tab (undo history, cursor, selection —
  // everything a document needs) — swapped in via `view.setState(...)` when the
  // active tab changes, so a single mounted editor backs every open tab
  // instead of keeping N live editors around (per CLAUDE.md: stay lightweight).
  const editorStates = new Map<string, EditorState>()
  let lastTabId: string | null = null
  let lastTrigger = 0
  let knownTabIds = new Set<string>()

  // Drop cached editor state for tabs that no longer exist, so closing tabs
  // doesn't leak their (potentially large) document state indefinitely.
  $effect(() => {
    const currentIds = new Set($tabs.map((t) => t.id))
    for (const id of knownTabIds) {
      if (!currentIds.has(id)) editorStates.delete(id)
    }
    knownTabIds = currentIds
  })

  /** Non-markdown files are viewable but locked for editing — fixed for a
   *  tab's lifetime (its path never changes), so this is baked in at
   *  creation rather than needing a reconfigurable Compartment. */
  function buildExtensions(path: string) {
    const readOnly = !isMarkdownPath(path)
    return [
      lineNumbers(),
      highlightActiveLine(),
      highlightActiveLineGutter(),
      history(),
      keymap.of([...defaultKeymap, ...historyKeymap]),
      markdown(),
      syntaxHighlighting(mdHighlight),
      EditorView.lineWrapping,
      EditorState.readOnly.of(readOnly),
      EditorView.editable.of(!readOnly),
      EditorView.updateListener.of((u) => {
        if (u.docChanged) {
          content.set(u.state.doc.toString())
          dirty.set(true)
        }
      }),
    ]
  }

  function createStateFor(path: string, doc: string): EditorState {
    return EditorState.create({ doc, extensions: buildExtensions(path) })
  }

  function restoreScroll(fraction: number) {
    queueMicrotask(() => {
      if (!view) return
      const el = view.scrollDOM
      const max = el.scrollHeight - el.clientHeight
      el.scrollTop = fraction * Math.max(0, max)
    })
  }

  onMount(() => {
    // A trivial placeholder — the effect below immediately swaps in the real
    // state for whichever tab is active (Editor.svelte only mounts once a
    // tab exists, so `$activeTabId` is always non-null by this point).
    view = new EditorView({ parent: host, state: EditorState.create({ extensions: [] }) })
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

  // Switch tabs (restoring that tab's own editor state) OR, for the same
  // tab, apply an external-reload dispatch in place — two different CodeMirror
  // operations, so they're kept as separate branches of one combined effect.
  $effect(() => {
    const id = $activeTabId
    const trigger = $reloadTrigger
    if (!view || (id === lastTabId && trigger === lastTrigger)) return

    const switchingTabs = id !== lastTabId
    if (switchingTabs && lastTabId) {
      editorStates.set(lastTabId, view.state)
    }
    lastTabId = id
    lastTrigger = trigger
    if (id === null) return // no tabs open

    if (switchingTabs) {
      const tab = get(tabs).find((t) => t.id === id)
      // A background reload means the cached state (if any) is stale — drop
      // it and rebuild from the fresh `content` tabs.ts just fetched instead.
      const forceFresh = tab?.needsReload ?? false
      let state = forceFresh ? undefined : editorStates.get(id)
      if (!state) {
        state = createStateFor(tab?.path ?? $currentFile ?? '', get(content))
        editorStates.set(id, state)
      }
      view.setState(state)
      if (forceFresh) {
        tabs.update((ts) => ts.map((t) => (t.id === id ? { ...t, needsReload: false } : t)))
      }
      restoreScroll(tab?.scrollFraction ?? 0)
    } else {
      // Same tab, external reload while it was active.
      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: get(content) } })
      editorStates.set(id, view.state)
    }
  })
</script>

<div class="cm-host" bind:this={host}></div>
