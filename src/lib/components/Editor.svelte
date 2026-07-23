<script lang="ts">
  import { onMount } from 'svelte'
  import { get } from 'svelte/store'
  import {
    EditorView, keymap, lineNumbers, highlightActiveLine, highlightActiveLineGutter,
  } from '@codemirror/view'
  import { EditorState, Annotation, Compartment } from '@codemirror/state'
  import { defaultKeymap, history, historyKeymap } from '@codemirror/commands'
  import { syntaxHighlighting, HighlightStyle, LanguageDescription } from '@codemirror/language'
  import { tags as t } from '@lezer/highlight'
  import { markdown } from '@codemirror/lang-markdown'
  import { languages } from '@codemirror/language-data'
  import {
    content, currentFile, dirty, editorScroll, reloadTrigger, activeTabId, tabs,
  } from '$lib/stores'
  import { isMarkdownPath } from '$lib/fileKind'
  import { baseName } from '$lib/tauri'

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

  // General source-code highlighting (Python, JS, Rust, etc. — any language
  // loaded via langCompartment below), reusing the exact same --code-*
  // variables the Preview pane's highlight.js output already uses (see
  // prose.css), so a given construct (a string, a comment, ...) gets the
  // same color whether you're looking at the editor or the preview.
  const codeHighlight = HighlightStyle.define([
    { tag: [t.keyword, t.controlKeyword, t.operatorKeyword, t.moduleKeyword, t.definitionKeyword, t.typeName],
      color: 'var(--code-keyword)' },
    { tag: [t.string, t.docString, t.character, t.special(t.string), t.regexp], color: 'var(--code-string)' },
    { tag: [t.comment, t.lineComment, t.blockComment, t.docComment], color: 'var(--code-comment)', fontStyle: 'italic' },
    { tag: [t.number, t.bool, t.null, t.atom], color: 'var(--code-number)' },
    { tag: [t.function(t.variableName), t.function(t.propertyName), t.className, t.definition(t.className)],
      color: 'var(--code-fn)' },
    { tag: [t.tagName, t.attributeName, t.variableName, t.propertyName], color: 'var(--code-tag)' },
  ])

  // Reserved slot for the current tab's language support extension, swapped
  // out asynchronously (see loadLanguageFor) once the matching @codemirror/
  // lang-* package finishes loading — shared across every tab's state (a
  // Compartment isn't tied to one EditorState, it's just a key identifying
  // a slot within whichever state's config it appears in).
  const langCompartment = new Compartment()
  // Tab ids whose language extension has already been resolved (or that
  // didn't need resolving, being markdown) — avoids redundant repeat loads
  // if a tab is revisited, since @codemirror/language-data's dynamic
  // imports, while individually cached by the module system, still cost an
  // async round trip to check.
  const languageResolvedFor = new Set<string>()

  let host: HTMLDivElement
  let view: EditorView | null = null

  /** Tags a dispatched transaction as a programmatic reload (external file
   *  change or manual refresh) rather than a user edit, so the
   *  updateListener below can tell the two apart. Without this, the reload
   *  dispatch in the tab-switch effect is indistinguishable from typing —
   *  CodeMirror fires the same `docChanged` update either way — which raced
   *  with refreshWorkspace()/the file-changed handler clearing `dirty` right
   *  before the dispatch: the listener's unconditional `dirty.set(true)`
   *  clobbered it straight back, leaving the tab stuck showing unsaved
   *  changes for content that in fact exactly matches disk. */
  const reloadAnnotation = Annotation.define<boolean>()

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
      if (!currentIds.has(id)) {
        editorStates.delete(id)
        languageResolvedFor.delete(id)
      }
    }
    knownTabIds = currentIds
  })

  /** Non-markdown files are viewable but locked for editing — fixed for a
   *  tab's lifetime (its path never changes), so this is baked in at
   *  creation rather than needing a reconfigurable Compartment (unlike the
   *  language itself, which does need one — see loadLanguageFor). */
  function buildExtensions(path: string) {
    const readOnly = !isMarkdownPath(path)
    return [
      lineNumbers(),
      highlightActiveLine(),
      highlightActiveLineGutter(),
      history(),
      keymap.of([...defaultKeymap, ...historyKeymap]),
      // Markdown loads synchronously (it's a regular static import, always
      // bundled); every other language loads asynchronously into this same
      // slot once loadLanguageFor resolves it — see there for why.
      langCompartment.of(isMarkdownPath(path) ? markdown() : []),
      syntaxHighlighting(mdHighlight),
      syntaxHighlighting(codeHighlight),
      EditorView.lineWrapping,
      EditorState.readOnly.of(readOnly),
      EditorView.editable.of(!readOnly),
      EditorView.updateListener.of((u) => {
        if (u.docChanged) {
          content.set(u.state.doc.toString())
          const isReload = u.transactions.some((tr) => tr.annotation(reloadAnnotation))
          if (!isReload) dirty.set(true)
        }
      }),
    ]
  }

  function createStateFor(path: string, doc: string): EditorState {
    return EditorState.create({ doc, extensions: buildExtensions(path) })
  }

  /** Resolve `path`'s language (by filename, via @codemirror/language-data's
   *  registry) and swap it into the tab's langCompartment slot once loaded.
   *  Dynamically imported per-language under the hood (Vite code-splits
   *  each into its own chunk, same lazy-loading approach as pdf.js — see
   *  CLAUDE.md), so a Python file's ~small lang-python chunk is fetched only
   *  when a Python file is actually opened, not bundled upfront for every
   *  language TEXT_EXTENSIONS recognizes.
   *
   *  Markdown is skipped (already wired synchronously in buildExtensions),
   *  and an unrecognized extension just leaves the slot empty — plain text,
   *  same as before this existed, rather than an error.
   *
   *  A tab can go to the background (or be revisited) while this is still
   *  in flight, so the resolved extension is applied to whichever "state"
   *  is currently canonical for `tabId`: the live view if it's still the
   *  active tab, or the cached background state otherwise — never blindly
   *  assumed to still be the active tab. */
  async function loadLanguageFor(tabId: string, path: string) {
    if (isMarkdownPath(path) || languageResolvedFor.has(tabId)) return
    const desc = LanguageDescription.matchFilename(languages, baseName(path))
    if (!desc) return
    const support = await desc.load()
    languageResolvedFor.add(tabId)
    const effect = langCompartment.reconfigure(support)
    if (view && get(activeTabId) === tabId) {
      view.dispatch({ effects: effect })
    } else {
      const cached = editorStates.get(tabId)
      if (cached) editorStates.set(tabId, cached.update({ effects: effect }).state)
    }
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
      const path = tab?.path ?? $currentFile ?? ''
      // A background reload means the cached state (if any) is stale — drop
      // it and rebuild from the fresh `content` tabs.ts just fetched instead.
      const forceFresh = tab?.needsReload ?? false
      let state = forceFresh ? undefined : editorStates.get(id)
      if (!state) {
        state = createStateFor(path, get(content))
        editorStates.set(id, state)
        // A brand new EditorState means a brand new (empty, for non-markdown)
        // langCompartment slot too, regardless of whether this tab's
        // language was already resolved for a *previous*, now-replaced
        // state object — so it must be allowed to resolve again here.
        languageResolvedFor.delete(id)
      }
      // `view.setState()` (below) does NOT fire the updateListener the way a
      // real dispatch does, so `content` is never otherwise touched by a
      // switch to an already-cached tab — it would just keep holding
      // whichever tab's text was last typed into or freshly loaded. That
      // silently stale `content` is what Preview, Toolbar's "Open in
      // browser", and — worst of all — save() all read from, so left
      // unfixed this doesn't just mis-render the preview, it can write one
      // tab's text into a completely different tab's file on disk. Always
      // resync it to whatever this tab's *actual* document is before
      // switching the view to it.
      content.set(state.doc.toString())
      view.setState(state)
      if (forceFresh) {
        tabs.update((ts) => ts.map((t) => (t.id === id ? { ...t, needsReload: false } : t)))
      }
      restoreScroll(tab?.scrollFraction ?? 0)
      void loadLanguageFor(id, path) // no-ops if already resolved (or markdown)
    } else {
      // Same tab, external reload while it was active. Tag the transaction
      // (see reloadAnnotation above) and re-clear `dirty` after dispatching
      // — belt-and-suspenders so this path always leaves the tab clean,
      // regardless of what the caller did before bumping reloadTrigger.
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: get(content) },
        annotations: reloadAnnotation.of(true),
      })
      dirty.set(false)
      editorStates.set(id, view.state)
    }
  })
</script>

<div class="cm-host" bind:this={host}></div>
