# Slate — Lightweight Themable Markdown Viewer — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use h-superpowers:subagent-driven-development, h-superpowers:team-driven-development, or h-superpowers:executing-plans to implement this plan (ask user which approach). Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a lightweight, low-memory Windows markdown editor with a split-pane live preview and a whole-app, file-based theme system.

**Architecture:** Tauri 2 native shell (Rust core + system WebView2) hosting a Svelte + TypeScript frontend. Rust owns file I/O and theme seeding; the frontend owns the editor (CodeMirror 6), rendering (markdown-it + plugins), and theme application (CSS custom properties). Themes are CSS files seeded to `%APPDATA%/com.hartye.slate/themes/` and listed in a dropdown.

**Tech Stack:** Tauri 2, Rust, Svelte 5 + TypeScript, Vite, CodeMirror 6, markdown-it, highlight.js, `@vscode/markdown-it-katex`, Mermaid, Vitest (+ jsdom), Rust `tempfile`/`open` crates, `@tauri-apps/plugin-dialog`.

**Source of truth:** Design spec at `docs/superpowers/specs/2026-06-25-markdown-viewer-design.md`.

**Prerequisites already confirmed:** Node 22, Rust 1.95/cargo, WebView2 (ships with Windows 11). Repo already `git init`'d with `.gitignore` ignoring `.superpowers/`, `node_modules/`, `/src-tauri/target/`, `dist/`.

---

## File Structure

```
(repo root)
├─ src/                         # Svelte frontend
│  ├─ main.ts                   # mount App
│  ├─ App.svelte                # layout shell: toolbar | sidebar | editor | preview | status
│  ├─ lib/
│  │  ├─ stores.ts              # currentFolder, currentFile, content, dirty, themes, activeTheme, statusMsg
│  │  ├─ markdown.ts            # markdown-it config + renderMarkdown()
│  │  ├─ theme.ts               # parseThemeName/parseMermaidMode/applyTheme
│  │  ├─ export.ts              # buildStandaloneHtml()
│  │  └─ tauri.ts               # typed wrappers around invoke() commands
│  └─ components/
│     ├─ Sidebar.svelte
│     ├─ Editor.svelte          # CodeMirror 6 host
│     ├─ Preview.svelte         # render target + mermaid.run
│     ├─ Toolbar.svelte         # filename, theme dropdown, open-in-browser
│     └─ StatusBar.svelte
├─ src/styles/base.css          # all app chrome/editor/preview styling via CSS variables
├─ src-tauri/
│  ├─ src/lib.rs                # commands + setup (theme seeding)
│  ├─ src/files.rs              # pure helpers: markdown_files_in, theme name parsing
│  ├─ themes/                   # starter theme CSS (embedded via include_str!)
│  │  ├─ midnight.css
│  │  ├─ paper.css
│  │  └─ minimal.css
│  ├─ Cargo.toml
│  └─ tauri.conf.json
├─ tests/                       # Vitest specs (*.test.ts)
└─ vitest.config.ts
```

Responsibilities: `files.rs` holds pure, unit-tested logic; `lib.rs` holds Tauri command wiring + setup. Frontend `lib/*` modules are each single-purpose and testable in isolation; `components/*` are thin views over the stores.

---

## Task 1: Scaffold Tauri 2 + Svelte-TS at repo root

**Files:**
- Create: entire scaffold (`src/`, `src-tauri/`, `package.json`, `vite.config.ts`, etc.)
- Modify: `.gitignore` (preserve `.superpowers/` ignore)

- [ ] **Step 1: Scaffold into a temp dir** (create-tauri-app refuses a non-empty target, so scaffold aside then move)

Run:
```bash
npm create tauri-app@latest .scaffold -- --template svelte-ts --manager npm --yes
```
Expected: creates `./.scaffold/` containing `package.json`, `src/`, `src-tauri/`, `vite.config.ts`, etc.

- [ ] **Step 2: Move scaffold contents to repo root, preserving our .gitignore**

Run (Git Bash):
```bash
mv .scaffold/.gitignore .scaffold/gitignore.tauri 2>/dev/null; \
shopt -s dotglob && mv .scaffold/* . && shopt -u dotglob && rmdir .scaffold && \
printf '%s\n' '.superpowers/' '.scaffold/' >> .gitignore && \
sort -u .gitignore -o .gitignore && rm -f gitignore.tauri
```
Expected: `package.json` and `src-tauri/` now at repo root; `.gitignore` still contains `.superpowers/`.

- [ ] **Step 3: Set app identity in `src-tauri/tauri.conf.json`**

Set these keys (leave the rest as scaffolded):
```json
{
  "productName": "Slate",
  "identifier": "com.hartye.slate",
  "app": {
    "windows": [
      { "title": "Slate", "width": 1100, "height": 720 }
    ]
  }
}
```

- [ ] **Step 4: Install dependencies**

Run:
```bash
npm install
```
Expected: completes without errors; `node_modules/` present.

- [ ] **Step 5: Verify the app builds and runs**

Run:
```bash
npm run tauri dev
```
Expected: a native window titled "Slate" opens showing the default Tauri+Svelte template. Close it (Ctrl+C in terminal).

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "chore: scaffold Tauri 2 + Svelte-TS app (Slate)"
```

---

## Task 2: Rust file I/O commands (TDD)

**Files:**
- Create: `src-tauri/src/files.rs`
- Modify: `src-tauri/src/lib.rs` (register module + commands)
- Modify: `src-tauri/Cargo.toml` (dev-dependency `tempfile`)

- [ ] **Step 1: Add `tempfile` dev-dependency**

In `src-tauri/Cargo.toml`, under `[dev-dependencies]` (create the section if absent):
```toml
[dev-dependencies]
tempfile = "3"
```

- [ ] **Step 2: Write failing tests for `markdown_files_in`**

Create `src-tauri/src/files.rs`:
```rust
use std::path::{Path, PathBuf};

/// Return absolute paths of `.md`/`.markdown` files directly in `dir`, sorted by file name.
pub fn markdown_files_in(dir: &Path) -> std::io::Result<Vec<PathBuf>> {
    let mut out: Vec<PathBuf> = Vec::new();
    for entry in std::fs::read_dir(dir)? {
        let path = entry?.path();
        if !path.is_file() {
            continue;
        }
        let is_md = path
            .extension()
            .and_then(|e| e.to_str())
            .map(|e| {
                let e = e.to_ascii_lowercase();
                e == "md" || e == "markdown"
            })
            .unwrap_or(false);
        if is_md {
            out.push(path);
        }
    }
    out.sort_by_key(|p| p.file_name().map(|n| n.to_ascii_lowercase()));
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    #[test]
    fn lists_only_markdown_sorted() {
        let dir = tempfile::tempdir().unwrap();
        fs::write(dir.path().join("b.md"), "x").unwrap();
        fs::write(dir.path().join("a.MD"), "x").unwrap();
        fs::write(dir.path().join("note.markdown"), "x").unwrap();
        fs::write(dir.path().join("ignore.txt"), "x").unwrap();
        fs::create_dir(dir.path().join("subdir")).unwrap();

        let files = markdown_files_in(dir.path()).unwrap();
        let names: Vec<String> = files
            .iter()
            .map(|p| p.file_name().unwrap().to_string_lossy().to_string())
            .collect();
        assert_eq!(names, vec!["a.MD", "b.md", "note.markdown"]);
    }
}
```

- [ ] **Step 3: Run the test to verify it fails**

Run:
```bash
cd src-tauri && cargo test files:: 2>&1 | tail -20; cd ..
```
Expected: FAIL — `files` module not declared in crate yet (compile error: cannot find module).

- [ ] **Step 4: Declare the module so the test compiles and passes**

In `src-tauri/src/lib.rs`, add near the top (below existing `use` lines):
```rust
mod files;
```

- [ ] **Step 5: Run the test to verify it passes**

Run:
```bash
cd src-tauri && cargo test files:: 2>&1 | tail -20; cd ..
```
Expected: PASS — `lists_only_markdown_sorted ... ok`.

- [ ] **Step 6: Add the Tauri commands wrapping file I/O**

In `src-tauri/src/lib.rs`, add these commands (above the `run()` function):
```rust
#[tauri::command]
fn list_markdown_files(folder: String) -> Result<Vec<String>, String> {
    let paths = files::markdown_files_in(std::path::Path::new(&folder))
        .map_err(|e| e.to_string())?;
    Ok(paths.into_iter().map(|p| p.to_string_lossy().to_string()).collect())
}

#[tauri::command]
fn read_file(path: String) -> Result<String, String> {
    std::fs::read_to_string(&path).map_err(|e| e.to_string())
}

#[tauri::command]
fn write_file(path: String, content: String) -> Result<(), String> {
    std::fs::write(&path, content).map_err(|e| e.to_string())
}
```
Then register them in the `tauri::Builder` chain inside `run()` — find `.invoke_handler(tauri::generate_handler![...])` and set it to:
```rust
.invoke_handler(tauri::generate_handler![
    list_markdown_files,
    read_file,
    write_file
])
```
(Remove the scaffolded `greet` command and its handler entry.)

- [ ] **Step 7: Verify the crate compiles**

Run:
```bash
cd src-tauri && cargo build 2>&1 | tail -20; cd ..
```
Expected: `Finished` with no errors.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: rust commands for listing/reading/writing markdown files"
```

---

## Task 3: Stores, typed invoke wrappers, folder picker, sidebar, load/save

**Files:**
- Create: `src/lib/stores.ts`, `src/lib/tauri.ts`
- Create: `src/components/Sidebar.svelte`, `src/components/StatusBar.svelte`, `src/components/Toolbar.svelte`
- Modify: `src/App.svelte`
- Modify: `package.json` (add dialog plugin), `src-tauri/Cargo.toml` + `src-tauri/src/lib.rs` (dialog plugin), `src-tauri/capabilities/default.json` (permissions)

- [ ] **Step 1: Add the dialog plugin (frontend + Rust)**

Run:
```bash
npm install @tauri-apps/plugin-dialog
cd src-tauri && cargo add tauri-plugin-dialog && cd ..
```

- [ ] **Step 2: Initialize the dialog plugin in Rust**

In `src-tauri/src/lib.rs`, in the `tauri::Builder` chain inside `run()`, add before `.invoke_handler(...)`:
```rust
.plugin(tauri_plugin_dialog::init())
```

- [ ] **Step 3: Grant dialog permission**

In `src-tauri/capabilities/default.json`, add `"dialog:default"` to the `"permissions"` array.

- [ ] **Step 4: Create typed command wrappers**

Create `src/lib/tauri.ts`:
```ts
import { invoke } from '@tauri-apps/api/core'

export const listMarkdownFiles = (folder: string) =>
  invoke<string[]>('list_markdown_files', { folder })

export const readFile = (path: string) =>
  invoke<string>('read_file', { path })

export const writeFile = (path: string, content: string) =>
  invoke<void>('write_file', { path, content })

/** File name from a full path (handles \\ and /). */
export const baseName = (path: string) => path.split(/[\\/]/).pop() ?? path
```

- [ ] **Step 5: Create the stores**

Create `src/lib/stores.ts`:
```ts
import { writable } from 'svelte/store'

export const currentFolder = writable<string | null>(null)
export const files = writable<string[]>([])        // full paths
export const currentFile = writable<string | null>(null)
export const content = writable<string>('')         // editor text
export const dirty = writable<boolean>(false)
export const statusMsg = writable<string>('')       // transient errors/info
export const editorScroll = writable<number>(0)     // 0..1 scroll fraction, for preview sync
```

- [ ] **Step 6: Create the Sidebar component**

Create `src/components/Sidebar.svelte`:
```svelte
<script lang="ts">
  import { open } from '@tauri-apps/plugin-dialog'
  import { currentFolder, files, currentFile, content, dirty, statusMsg } from '../lib/stores'
  import { listMarkdownFiles, readFile, baseName } from '../lib/tauri'

  async function chooseFolder() {
    const picked = await open({ directory: true })
    if (typeof picked !== 'string') return
    currentFolder.set(picked)
    try {
      files.set(await listMarkdownFiles(picked))
    } catch (e) {
      statusMsg.set(`Could not list folder: ${e}`)
    }
  }

  async function openFile(path: string) {
    try {
      const text = await readFile(path)
      content.set(text)
      currentFile.set(path)
      dirty.set(false)
    } catch (e) {
      statusMsg.set(`Could not open file: ${e}`)
    }
  }
</script>

<aside class="sidebar">
  <button class="folder-btn" onclick={chooseFolder}>
    {$currentFolder ? baseName($currentFolder) : 'Choose folder…'}
  </button>
  <ul>
    {#each $files as path (path)}
      <li>
        <button class:active={$currentFile === path} onclick={() => openFile(path)}>
          {baseName(path)}
        </button>
      </li>
    {/each}
  </ul>
</aside>
```

- [ ] **Step 7: Create the StatusBar and Toolbar (minimal for now)**

Create `src/components/StatusBar.svelte`:
```svelte
<script lang="ts">
  import { currentFile, dirty, statusMsg } from '../lib/stores'
</script>

<footer class="statusbar">
  <span>{$currentFile ?? 'No file'}</span>
  <span class="spacer"></span>
  {#if $statusMsg}<span class="msg">{$statusMsg}</span>{/if}
  {#if $dirty}<span class="unsaved">● unsaved</span>{/if}
  <span class="hint">Ctrl+S to save</span>
</footer>
```

Create `src/components/Toolbar.svelte` (interim version — the theme dropdown and
open-in-browser button are added in Tasks 7 and 8):
```svelte
<script lang="ts">
  import { currentFile, currentFolder } from '../lib/stores'
  import { baseName } from '../lib/tauri'
</script>

<header class="toolbar">
  <strong>{$currentFile ? baseName($currentFile) : 'Slate'}</strong>
  {#if $currentFolder}<span class="muted">— {$currentFolder}</span>{/if}
  <span class="spacer"></span>
</header>
```

- [ ] **Step 8: Wire App.svelte with a temporary textarea editor + Ctrl+S save**

Replace `src/App.svelte` entirely with:
```svelte
<script lang="ts">
  import Toolbar from './components/Toolbar.svelte'
  import Sidebar from './components/Sidebar.svelte'
  import StatusBar from './components/StatusBar.svelte'
  import { content, currentFile, dirty, statusMsg } from './lib/stores'
  import { writeFile } from './lib/tauri'
  import './styles/base.css'

  function onInput(e: Event) {
    content.set((e.target as HTMLTextAreaElement).value)
    dirty.set(true)
  }

  async function save() {
    const path = $currentFile
    if (!path) return
    try {
      await writeFile(path, $content)
      dirty.set(false)
      statusMsg.set('')
    } catch (e) {
      statusMsg.set(`Save failed: ${e}`)
    }
  }

  function onKeydown(e: KeyboardEvent) {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
      e.preventDefault()
      save()
    }
  }
</script>

<svelte:window on:keydown={onKeydown} />

<div class="app">
  <Toolbar />
  <div class="body">
    <Sidebar />
    <main class="editor-pane">
      <textarea value={$content} oninput={onInput}></textarea>
    </main>
    <section class="preview-pane"><pre>{$content}</pre></section>
  </div>
  <StatusBar />
</div>
```

- [ ] **Step 9: Add minimal layout CSS**

Create `src/styles/base.css`:
```css
:root {
  --bg: #1e1e24; --bg-elevated: #26262e; --fg: #e6e6ea; --fg-muted: #9a9aa6;
  --border: #34343e; --accent: #7a8cff;
  --editor-bg: #1e1e24; --editor-fg: #e6e6ea; --editor-font: ui-monospace, monospace;
  --prose-bg: #1e1e24; --prose-fg: #e6e6ea; --prose-font: system-ui, sans-serif;
  --prose-heading: #fff; --prose-link: #7a8cff; --prose-code-bg: #2a2a34;
  --prose-max-width: 760px; --prose-line-height: 1.7;
  --code-keyword: #bb9af7; --code-string: #9ece6a; --code-comment: #565f89;
  --code-number: #ff9e64; --code-fn: #7aa2f7; --code-tag: #f7768e;
}
* { box-sizing: border-box; }
html, body, .app { height: 100%; margin: 0; }
body { font-family: system-ui, sans-serif; color: var(--fg); background: var(--bg); }
.app { display: flex; flex-direction: column; }
.toolbar, .statusbar { display: flex; align-items: center; gap: 8px; padding: 6px 12px;
  background: var(--bg-elevated); border-bottom: 1px solid var(--border); font-size: 13px; }
.statusbar { border-top: 1px solid var(--border); border-bottom: 0; color: var(--fg-muted); }
.spacer { flex: 1; }
.muted { color: var(--fg-muted); }
.unsaved { color: #d9954a; }
.body { flex: 1; display: flex; min-height: 0; }
.sidebar { width: 200px; background: var(--bg-elevated); border-right: 1px solid var(--border);
  overflow: auto; padding: 8px; }
.sidebar ul { list-style: none; margin: 8px 0 0; padding: 0; }
.sidebar button { width: 100%; text-align: left; background: none; border: 0; color: var(--fg);
  padding: 4px 6px; border-radius: 4px; cursor: pointer; font-size: 13px; }
.sidebar button.active { background: var(--accent); color: #fff; }
.folder-btn { color: var(--fg-muted) !important; }
.editor-pane, .preview-pane { flex: 1; min-width: 0; overflow: auto; }
.editor-pane textarea { width: 100%; height: 100%; border: 0; resize: none; padding: 12px;
  background: var(--bg); color: var(--fg); font-family: ui-monospace, monospace; font-size: 14px; }
.preview-pane { border-left: 1px solid var(--border); padding: 12px; }
```

- [ ] **Step 10: Manual verification**

Run:
```bash
npm run tauri dev
```
Expected: window opens. Click "Choose folder…", pick a folder containing `.md` files → sidebar lists them. Click one → text loads in the textarea and the right pane mirrors it. Edit text → status bar shows "● unsaved". Press Ctrl+S → "unsaved" clears; reopening the file shows saved content. Close with Ctrl+C.

- [ ] **Step 11: Commit**

```bash
git add -A
git commit -m "feat: folder sidebar, file open/save, temporary textarea editor"
```

---

## Task 4: Replace textarea with CodeMirror 6

**Files:**
- Create: `src/components/Editor.svelte`
- Modify: `src/App.svelte` (use `<Editor />`)
- Modify: `package.json` (CodeMirror deps)

- [ ] **Step 1: Install CodeMirror 6**

Run:
```bash
npm install codemirror @codemirror/lang-markdown @codemirror/view @codemirror/state @codemirror/commands
```

- [ ] **Step 2: Create the Editor component**

Create `src/components/Editor.svelte`. The editor is built once in `onMount` (NOT in a
`$effect`, which would rebuild it on every keystroke). A separate `$effect` reacts only to
`$currentFile` to swap the document when a different file opens, reading `content`
non-reactively via `get()` so typing doesn't retrigger it. A scroll listener on the
CodeMirror scroller publishes a 0..1 fraction to `editorScroll` for preview sync.
```svelte
<script lang="ts">
  import { onMount } from 'svelte'
  import { get } from 'svelte/store'
  import { EditorView, keymap } from '@codemirror/view'
  import { EditorState } from '@codemirror/state'
  import { defaultKeymap, history, historyKeymap } from '@codemirror/commands'
  import { markdown } from '@codemirror/lang-markdown'
  import { content, currentFile, dirty, editorScroll } from '../lib/stores'

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
```

- [ ] **Step 3: Use Editor in App.svelte**

In `src/App.svelte`, replace the `<main class="editor-pane">…</main>` block with:
```svelte
    <main class="editor-pane"><Editor /></main>
```
And add the import at the top of the `<script>`:
```svelte
  import Editor from './components/Editor.svelte'
```
Remove the now-unused `onInput` function.

- [ ] **Step 4: Add CodeMirror host CSS**

Append to `src/styles/base.css`:
```css
.cm-host, .cm-host .cm-editor { height: 100%; }
.cm-host .cm-scroller { font-family: ui-monospace, monospace; font-size: 14px; }
```

- [ ] **Step 5: Manual verification**

Run `npm run tauri dev`. Open a file → CodeMirror shows it with line wrapping. Typing marks "● unsaved"; Ctrl+S saves. Switching files swaps the document. Close.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: CodeMirror 6 markdown editor"
```

---

## Task 5: markdown.ts baseline rendering (TDD) + live Preview

**Files:**
- Create: `src/lib/markdown.ts`, `src/components/Preview.svelte`, `vitest.config.ts`, `tests/markdown.test.ts`
- Modify: `src/App.svelte` (use `<Preview />`), `package.json` (markdown-it, vitest, jsdom)

- [ ] **Step 1: Install markdown-it + test tooling**

Run:
```bash
npm install markdown-it markdown-it-task-lists
npm install -D @types/markdown-it vitest jsdom
```

`markdown-it-task-lists` ships no types; add a one-line shim so a future `tsc`/`svelte-check`
doesn't choke (esbuild/Vite ignore types, so tests pass regardless). Create `src/types/shims.d.ts`:
```ts
declare module 'markdown-it-task-lists'
```

- [ ] **Step 2: Add Vitest config**

Create `vitest.config.ts`:
```ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: { environment: 'jsdom', include: ['tests/**/*.test.ts'] },
})
```
Add a script to `package.json` `"scripts"`: `"test": "vitest run"`.

- [ ] **Step 3: Write failing tests for renderMarkdown (baseline + GFM)**

Create `tests/markdown.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { renderMarkdown } from '../src/lib/markdown'

describe('renderMarkdown', () => {
  it('renders headings and paragraphs', () => {
    expect(renderMarkdown('# Hello')).toContain('<h1>Hello</h1>')
  })
  it('renders GFM tables', () => {
    const md = '| a | b |\n| - | - |\n| 1 | 2 |'
    expect(renderMarkdown(md)).toContain('<table>')
  })
  it('renders task lists', () => {
    expect(renderMarkdown('- [x] done')).toContain('type="checkbox"')
  })
  it('autolinks bare URLs', () => {
    expect(renderMarkdown('see https://example.com')).toContain('<a href="https://example.com"')
  })
})
```

- [ ] **Step 4: Run tests to verify they fail**

Run:
```bash
npm test 2>&1 | tail -20
```
Expected: FAIL — cannot resolve `../src/lib/markdown`.

- [ ] **Step 5: Implement markdown.ts (baseline + GFM)**

Create `src/lib/markdown.ts`:
```ts
import MarkdownIt from 'markdown-it'
import taskLists from 'markdown-it-task-lists'

const md: MarkdownIt = new MarkdownIt({
  html: false,
  linkify: true,
  breaks: false,
})

md.use(taskLists)

export function renderMarkdown(src: string): string {
  return md.render(src)
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run:
```bash
npm test 2>&1 | tail -20
```
Expected: PASS — all four tests green. (markdown-it renders tables and `linkify:true` autolinks; the `markdown-it-task-lists` plugin emits `<input type="checkbox">`.)

- [ ] **Step 7: Create the Preview component (debounced, scroll-synced)**

Create `src/components/Preview.svelte`:
```svelte
<script lang="ts">
  import { content } from '../lib/stores'
  import { renderMarkdown } from '../lib/markdown'

  let html = $state('')
  let timer: ReturnType<typeof setTimeout> | null = null

  $effect(() => {
    const src = $content
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => { html = renderMarkdown(src) }, 120)
  })
</script>

<div class="preview">
  {@html html}
</div>
```

- [ ] **Step 8: Use Preview + add a resizable, scroll-synced split**

Replace the `.body` block in `src/App.svelte` with:
```svelte
  <div class="body">
    <Sidebar />
    <div class="split">
      <main class="editor-pane" style="flex:{editorFlex}"><Editor /></main>
      <div class="divider" onmousedown={startDrag} role="separator" aria-orientation="vertical"></div>
      <section class="preview-pane" bind:this={previewPane}><Preview /></section>
    </div>
  </div>
```
Add imports and the drag/scroll logic to the `<script>`. Scroll-sync reads the `editorScroll`
fraction published by the CodeMirror scroller (the editor pane itself never scrolls — CM
scrolls its inner `.cm-scroller`):
```svelte
  import Preview from './components/Preview.svelte'
  import { editorScroll } from './lib/stores'

  let previewPane: HTMLElement
  let editorFlex = $state(1)

  function startDrag(e: MouseEvent) {
    e.preventDefault()
    const split = (e.currentTarget as HTMLElement).parentElement!
    const rect = split.getBoundingClientRect()
    function move(ev: MouseEvent) {
      const clamped = Math.min(0.8, Math.max(0.2, (ev.clientX - rect.left) / rect.width))
      editorFlex = clamped / (1 - clamped)
    }
    function up() { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up) }
    window.addEventListener('mousemove', move); window.addEventListener('mouseup', up)
  }

  // Mirror the editor's scroll fraction onto the preview pane.
  $effect(() => {
    const frac = $editorScroll
    if (!previewPane) return
    previewPane.scrollTop = frac * (previewPane.scrollHeight - previewPane.clientHeight)
  })
```

- [ ] **Step 9: Add split/divider CSS**

Append to `src/styles/base.css`:
```css
.split { flex: 1; display: flex; min-width: 0; }
.divider { width: 6px; cursor: col-resize; background: var(--border); flex: 0 0 auto; }
.preview-pane { flex: 1; }
.preview { max-width: 100%; }
.preview pre { overflow: auto; }
```

- [ ] **Step 10: Manual verification**

Run `npm run tauri dev`. Open a markdown file → right pane renders headings/tables/task lists/links. Edit → preview updates after a brief debounce. Drag the divider → panes resize. Scroll the editor → preview follows. Close.

- [ ] **Step 11: Commit**

```bash
git add -A
git commit -m "feat: markdown-it rendering with live, resizable, scroll-synced preview"
```

---

## Task 6: Rendering extras — syntax highlighting, KaTeX, Mermaid (TDD)

**Files:**
- Modify: `src/lib/markdown.ts`, `src/components/Preview.svelte`, `tests/markdown.test.ts`
- Modify: `package.json` (highlight.js, katex plugin, mermaid)

- [ ] **Step 1: Install render extras**

Run:
```bash
npm install highlight.js @vscode/markdown-it-katex katex mermaid
```

- [ ] **Step 2: Add failing tests for the three extras**

Append to `tests/markdown.test.ts`:
```ts
describe('renderMarkdown extras', () => {
  it('highlights fenced code', () => {
    const out = renderMarkdown('```js\nconst x = 1\n```')
    expect(out).toContain('class="hljs"')
    expect(out).toContain('hljs-keyword') // `const`
  })
  it('renders inline math via KaTeX', () => {
    expect(renderMarkdown('$E=mc^2$')).toContain('class="katex"')
  })
  it('marks mermaid fences for client rendering', () => {
    const out = renderMarkdown('```mermaid\ngraph LR; A-->B\n```')
    expect(out).toContain('<pre class="mermaid">')
    expect(out).toContain('graph LR')
  })
})
```

- [ ] **Step 3: Run to verify failure**

Run:
```bash
npm test 2>&1 | tail -25
```
Expected: FAIL — no `hljs`/`katex`/`mermaid` markers in output.

- [ ] **Step 4: Extend markdown.ts**

Edit `src/lib/markdown.ts`. Replace the `MarkdownIt` construction and add the katex plugin + highlight + mermaid fence handling. New top of file:
```ts
import MarkdownIt from 'markdown-it'
import taskLists from 'markdown-it-task-lists'
import hljs from 'highlight.js'
import katex from '@vscode/markdown-it-katex'

const md: MarkdownIt = new MarkdownIt({
  html: false,
  linkify: true,
  breaks: false,
  highlight: (code, lang) => {
    if (lang === 'mermaid') {
      return `<pre class="mermaid">${md.utils.escapeHtml(code)}</pre>`
    }
    if (lang && hljs.getLanguage(lang)) {
      try {
        const inner = hljs.highlight(code, { language: lang }).value
        return `<pre class="hljs"><code>${inner}</code></pre>`
      } catch { /* fall through */ }
    }
    return `<pre class="hljs"><code>${md.utils.escapeHtml(code)}</code></pre>`
  },
})

md.use(taskLists)
md.use(katex)
```
Keep the existing `import taskLists from 'markdown-it-task-lists'` line and the
`renderMarkdown` export unchanged. The `import MarkdownIt` line stays; add the new
`import hljs` and `import katex` lines at the top.

- [ ] **Step 5: Run to verify pass**

Run:
```bash
npm test 2>&1 | tail -25
```
Expected: PASS — all extras tests green. (`@vscode/markdown-it-katex` renders `$…$`; hljs emits `hljs-keyword`; mermaid fences become `<pre class="mermaid">`.)

- [ ] **Step 6: Run Mermaid + load KaTeX/hljs CSS in Preview**

Edit `src/components/Preview.svelte`. Add imports and a mermaid run after each render. New `<script>`:
```svelte
<script lang="ts">
  import { content, activeMermaidMode } from '../lib/stores'
  import { renderMarkdown } from '../lib/markdown'
  import mermaid from 'mermaid'
  import 'katex/dist/katex.min.css'
  // No hljs stylesheet import — code token colors come from the active theme's
  // --code-* CSS variables (mapped in base.css), so highlighting follows the theme.

  let container: HTMLDivElement
  let html = $state('')
  let timer: ReturnType<typeof setTimeout> | null = null

  mermaid.initialize({ startOnLoad: false })

  $effect(() => {
    const src = $content
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => { html = renderMarkdown(src) }, 120)
  })

  // After HTML updates, render any mermaid blocks.
  $effect(() => {
    void html
    if (!container) return
    const nodes = container.querySelectorAll<HTMLElement>('pre.mermaid')
    if (nodes.length === 0) return
    mermaid.initialize({ startOnLoad: false, theme: $activeMermaidMode })
    queueMicrotask(() => {
      mermaid.run({ nodes }).catch(() => { /* leave source visible on error */ })
    })
  })
</script>

<div class="preview" bind:this={container}>
  {@html html}
</div>
```
Note: `activeMermaidMode` store is added in Task 7; for now add a placeholder so this compiles — in `src/lib/stores.ts` add:
```ts
export const activeMermaidMode = writable<'default' | 'dark'>('dark')
```

- [ ] **Step 7: Manual verification**

Run `npm run tauri dev`. Open a file containing a ```js block (colored), `$E=mc^2$` (rendered equation), and a ```mermaid graph (rendered diagram). Confirm all three render. Close.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: syntax highlighting, KaTeX math, and Mermaid diagrams"
```

---

## Task 7: Theme system — Rust seeding + theme.ts (TDD) + dropdown + variable styling

**Files:**
- Create: `src-tauri/themes/midnight.css`, `paper.css`, `minimal.css`
- Modify: `src-tauri/src/files.rs` (theme name/mermaid parse + tests), `src-tauri/src/lib.rs` (seed + `list_themes`)
- Create: `src/lib/theme.ts`, `tests/theme.test.ts`
- Modify: `src/lib/stores.ts`, `src/components/Toolbar.svelte`, `src/App.svelte`, `src/styles/base.css`

- [ ] **Step 1: Write the three starter theme files**

Create `src-tauri/themes/midnight.css`:
```css
/* @name Midnight */
/* @mermaid dark */
:root {
  --bg: #1b1d23; --bg-elevated: #23262e; --fg: #e7e9ee; --fg-muted: #9aa0ad;
  --border: #323641; --accent: #7aa2f7;
  --editor-bg: #1b1d23; --editor-fg: #e7e9ee; --editor-font: ui-monospace, monospace;
  --prose-bg: #1b1d23; --prose-fg: #e7e9ee; --prose-font: system-ui, sans-serif;
  --prose-heading: #ffffff; --prose-link: #7aa2f7; --prose-code-bg: #2a2e38;
  --prose-max-width: 760px; --prose-line-height: 1.7;
  --code-keyword: #bb9af7; --code-string: #9ece6a; --code-comment: #565f89;
  --code-number: #ff9e64; --code-fn: #7aa2f7; --code-tag: #f7768e;
}
```

Create `src-tauri/themes/paper.css`:
```css
/* @name Paper */
/* @mermaid default */
:root {
  --bg: #f5f1e8; --bg-elevated: #efe9dc; --fg: #3a3631; --fg-muted: #847d70;
  --border: #ddd5c5; --accent: #a8623a;
  --editor-bg: #fbf8f1; --editor-fg: #3a3631; --editor-font: ui-monospace, monospace;
  --prose-bg: #fbf8f1; --prose-fg: #3a3631; --prose-font: Georgia, 'Times New Roman', serif;
  --prose-heading: #2b2824; --prose-link: #a8623a; --prose-code-bg: #efe9dc;
  --prose-max-width: 680px; --prose-line-height: 1.75;
  --code-keyword: #9a3b2f; --code-string: #5b6e2f; --code-comment: #9b9486;
  --code-number: #a8623a; --code-fn: #2f6f6b; --code-tag: #8a4b2f;
}
```

Create `src-tauri/themes/minimal.css`:
```css
/* @name Minimal */
/* @mermaid default */
:root {
  --bg: #ffffff; --bg-elevated: #f6f6f7; --fg: #1f2328; --fg-muted: #6e7781;
  --border: #e2e4e8; --accent: #2563eb;
  --editor-bg: #ffffff; --editor-fg: #1f2328; --editor-font: ui-monospace, monospace;
  --prose-bg: #ffffff; --prose-fg: #1f2328; --prose-font: system-ui, sans-serif;
  --prose-heading: #1f2328; --prose-link: #2563eb; --prose-code-bg: #f6f6f7;
  --prose-max-width: 720px; --prose-line-height: 1.7;
  --code-keyword: #cf222e; --code-string: #0a3069; --code-comment: #6e7781;
  --code-number: #0550ae; --code-fn: #8250df; --code-tag: #116329;
}
```

- [ ] **Step 2: Write failing tests for theme header parsing**

Append to `src-tauri/src/files.rs` (inside the file, above `#[cfg(test)]`, add the functions; then add tests in the `tests` module):
```rust
/// Extract `/* @name X */` value, or "Untitled".
pub fn parse_theme_name(css: &str) -> String {
    parse_header(css, "@name").unwrap_or_else(|| "Untitled".to_string())
}

/// Extract `/* @mermaid dark|default */`, defaulting to "default".
pub fn parse_mermaid_mode(css: &str) -> String {
    match parse_header(css, "@mermaid").as_deref() {
        Some("dark") => "dark".to_string(),
        _ => "default".to_string(),
    }
}

fn parse_header(css: &str, key: &str) -> Option<String> {
    for line in css.lines().take(10) {
        if let Some(idx) = line.find(key) {
            let rest = line[idx + key.len()..].trim();
            let val = rest.trim_end_matches("*/").trim();
            if !val.is_empty() {
                return Some(val.to_string());
            }
        }
    }
    None
}
```
Add to the `mod tests` block:
```rust
    #[test]
    fn parses_theme_name_and_mermaid() {
        let css = "/* @name Midnight */\n/* @mermaid dark */\n:root{}";
        assert_eq!(parse_theme_name(css), "Midnight");
        assert_eq!(parse_mermaid_mode(css), "dark");
    }
    #[test]
    fn theme_defaults_when_absent() {
        assert_eq!(parse_theme_name(":root{}"), "Untitled");
        assert_eq!(parse_mermaid_mode(":root{}"), "default");
    }
```

- [ ] **Step 3: Run to verify failure**

Run:
```bash
cd src-tauri && cargo test files:: 2>&1 | tail -20; cd ..
```
Expected: FAIL — `parse_theme_name`/`parse_mermaid_mode` not found (until Step 2 functions compile) → actually compile error first run; once added it compiles. If you added functions + tests together, expected result is PASS. Re-run after Step 4 if you split.

- [ ] **Step 4: Add the seed + list_themes commands**

In `src-tauri/src/lib.rs`, add near the top:
```rust
use tauri::Manager;

const STARTER_THEMES: &[(&str, &str)] = &[
    ("midnight.css", include_str!("../themes/midnight.css")),
    ("paper.css", include_str!("../themes/paper.css")),
    ("minimal.css", include_str!("../themes/minimal.css")),
];

#[derive(serde::Serialize)]
struct ThemeInfo { name: String, mermaid: String, css: String }

fn themes_dir(app: &tauri::AppHandle) -> Result<std::path::PathBuf, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?.join("themes");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

fn seed_themes(app: &tauri::AppHandle) -> Result<(), String> {
    let dir = themes_dir(app)?;
    for (name, body) in STARTER_THEMES {
        let path = dir.join(name);
        if !path.exists() {
            std::fs::write(&path, body).map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

#[tauri::command]
fn list_themes(app: tauri::AppHandle) -> Result<Vec<ThemeInfo>, String> {
    let dir = themes_dir(&app)?;
    let mut out = Vec::new();
    for entry in std::fs::read_dir(&dir).map_err(|e| e.to_string())? {
        let path = entry.map_err(|e| e.to_string())?.path();
        if path.extension().and_then(|e| e.to_str()) == Some("css") {
            let css = std::fs::read_to_string(&path).map_err(|e| e.to_string())?;
            out.push(ThemeInfo {
                name: files::parse_theme_name(&css),
                mermaid: files::parse_mermaid_mode(&css),
                css,
            });
        }
    }
    out.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    Ok(out)
}
```
In `run()`, add a `.setup(...)` before `.invoke_handler(...)`:
```rust
.setup(|app| {
    seed_themes(&app.handle()).map_err(|e| e.to_string())?;
    Ok(())
})
```
And add `list_themes` to the `generate_handler!` list.

- [ ] **Step 5: Verify Rust tests + build**

Run:
```bash
cd src-tauri && cargo test files:: 2>&1 | tail -20 && cargo build 2>&1 | tail -5; cd ..
```
Expected: theme parse tests PASS; crate builds.

- [ ] **Step 6: Write failing tests for theme.ts**

Create `tests/theme.test.ts`:
```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { applyTheme } from '../src/lib/theme'

describe('applyTheme', () => {
  beforeEach(() => { document.head.innerHTML = '' })
  it('injects a single style element and replaces on re-apply', () => {
    applyTheme(':root{--bg:#000}')
    let style = document.getElementById('active-theme') as HTMLStyleElement
    expect(style).toBeTruthy()
    expect(style.textContent).toContain('--bg:#000')
    applyTheme(':root{--bg:#fff}')
    expect(document.querySelectorAll('#active-theme').length).toBe(1)
    style = document.getElementById('active-theme') as HTMLStyleElement
    expect(style.textContent).toContain('--bg:#fff')
  })
})
```

- [ ] **Step 7: Run to verify failure**

Run:
```bash
npm test 2>&1 | tail -20
```
Expected: FAIL — cannot resolve `../src/lib/theme`.

- [ ] **Step 8: Implement theme.ts**

Create `src/lib/theme.ts`:
```ts
import { invoke } from '@tauri-apps/api/core'

export interface Theme { name: string; mermaid: 'default' | 'dark'; css: string }

export const listThemes = () => invoke<Theme[]>('list_themes')

/** Inject the theme CSS as the single #active-theme <style>, replacing any prior. */
export function applyTheme(css: string): void {
  let style = document.getElementById('active-theme') as HTMLStyleElement | null
  if (!style) {
    style = document.createElement('style')
    style.id = 'active-theme'
    document.head.appendChild(style)
  }
  style.textContent = css
}
```

- [ ] **Step 9: Run to verify pass**

Run:
```bash
npm test 2>&1 | tail -20
```
Expected: PASS — applyTheme test green.

- [ ] **Step 10: Add theme stores**

In `src/lib/stores.ts`, add:
```ts
import type { Theme } from './theme'
export const themes = writable<Theme[]>([])
export const activeThemeName = writable<string | null>(null)
// activeMermaidMode already added in Task 6; keep it.
```

- [ ] **Step 11: Load themes + render the dropdown in Toolbar**

Replace `src/components/Toolbar.svelte` with:
```svelte
<script lang="ts">
  import { onMount } from 'svelte'
  import { currentFile, currentFolder, themes, activeThemeName, activeMermaidMode } from '../lib/stores'
  import { baseName } from '../lib/tauri'
  import { listThemes, applyTheme, type Theme } from '../lib/theme'

  function select(t: Theme) {
    applyTheme(t.css)
    activeThemeName.set(t.name)
    activeMermaidMode.set(t.mermaid)
  }

  onMount(async () => {
    const loaded = await listThemes()
    themes.set(loaded)
    if (loaded.length > 0) select(loaded.find((t) => t.name === 'Midnight') ?? loaded[0])
  })

  function onChange(e: Event) {
    const name = (e.target as HTMLSelectElement).value
    const t = $themes.find((x) => x.name === name)
    if (t) select(t)
  }
</script>

<header class="toolbar">
  <strong>{$currentFile ? baseName($currentFile) : 'Slate'}</strong>
  {#if $currentFolder}<span class="muted">— {$currentFolder}</span>{/if}
  <span class="spacer"></span>
  <label class="theme-label">Theme
    <select onchange={onChange} value={$activeThemeName ?? ''}>
      {#each $themes as t (t.name)}<option value={t.name}>{t.name}</option>{/each}
    </select>
  </label>
</header>
```

- [ ] **Step 12: Convert base.css chrome + preview to consume theme variables**

In `src/styles/base.css`, keep the `:root` fallback block, then ensure the chrome/editor/preview rules reference variables. Replace the editor/preview rules with:
```css
.editor-pane { background: var(--editor-bg); }
.cm-host .cm-scroller { color: var(--editor-fg); font-family: var(--editor-font); }
.preview-pane { background: var(--prose-bg); }
.preview { color: var(--prose-fg); font-family: var(--prose-font);
  max-width: var(--prose-max-width); margin: 0 auto; line-height: var(--prose-line-height); }
.preview h1, .preview h2, .preview h3, .preview h4 { color: var(--prose-heading); }
.preview a { color: var(--prose-link); }
.preview code { background: var(--prose-code-bg); padding: 0.1em 0.3em; border-radius: 4px; }
.preview pre.hljs, .preview pre code { background: var(--prose-code-bg); }
.preview pre { padding: 12px; border-radius: 6px; overflow: auto; }
/* highlight.js token colors driven by the active theme's --code-* variables */
.preview .hljs-keyword, .preview .hljs-built_in, .preview .hljs-type { color: var(--code-keyword); }
.preview .hljs-string, .preview .hljs-attr, .preview .hljs-meta-string { color: var(--code-string); }
.preview .hljs-comment, .preview .hljs-quote { color: var(--code-comment); font-style: italic; }
.preview .hljs-number, .preview .hljs-literal { color: var(--code-number); }
.preview .hljs-title, .preview .hljs-title.function_, .preview .hljs-section { color: var(--code-fn); }
.preview .hljs-name, .preview .hljs-tag, .preview .hljs-attribute { color: var(--code-tag); }
/* caret/selection follow the editor colors so they stay visible on any theme */
.cm-host .cm-cursor { border-left-color: var(--editor-fg); }
.cm-host .cm-selectionBackground, .cm-host.cm-focused .cm-selectionBackground { background: var(--accent); opacity: 0.25; }
```

- [ ] **Step 13: Manual verification**

Run `npm run tauri dev`. The theme dropdown shows Midnight / Minimal / Paper. Switching themes restyles the **whole app** — sidebar, editor background, toolbar, and preview typography/colors — and Mermaid diagrams re-render in the theme's mermaid mode. Close.

- [ ] **Step 14: Commit**

```bash
git add -A
git commit -m "feat: whole-app theme system with seeded selectable themes"
```

---

## Task 8: Open in browser (themed HTML export)

**Files:**
- Create: `src/lib/export.ts`, `tests/export.test.ts`
- Modify: `src-tauri/src/lib.rs` (`open_in_browser` command), `src-tauri/Cargo.toml` (`open` crate)
- Modify: `src/components/Toolbar.svelte` (button)

- [ ] **Step 1: Add the `open` crate**

Run:
```bash
cd src-tauri && cargo add open && cd ..
```

- [ ] **Step 2: Add the Rust command**

In `src-tauri/src/lib.rs`, add:
```rust
#[tauri::command]
fn open_in_browser(app: tauri::AppHandle, html: String) -> Result<(), String> {
    let dir = app.path().app_cache_dir().map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let path = dir.join("slate-preview.html");
    std::fs::write(&path, html).map_err(|e| e.to_string())?;
    open::that(&path).map_err(|e| e.to_string())
}
```
Add `open_in_browser` to the `generate_handler!` list.

- [ ] **Step 3: Write failing test for buildStandaloneHtml**

Create `tests/export.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { buildStandaloneHtml } from '../src/lib/export'

describe('buildStandaloneHtml', () => {
  it('embeds rendered body, theme css, and title', () => {
    const out = buildStandaloneHtml('<h1>Hi</h1>', ':root{--bg:#000}', 'notes.md')
    expect(out.startsWith('<!DOCTYPE html>')).toBe(true)
    expect(out).toContain('<title>notes.md</title>')
    expect(out).toContain(':root{--bg:#000}')
    expect(out).toContain('<h1>Hi</h1>')
    expect(out).toContain('class="preview"')
  })
})
```

- [ ] **Step 4: Run to verify failure**

Run:
```bash
npm test 2>&1 | tail -20
```
Expected: FAIL — cannot resolve `../src/lib/export`.

- [ ] **Step 5: Implement export.ts**

Create `src/lib/export.ts`. The theme CSS already carries the `--code-*` variables, so the
exported page maps highlight.js token classes to those variables (same approach as in-app) —
no separate hljs stylesheet needed. KaTeX CSS is still required for math glyphs.
```ts
import katexCss from 'katex/dist/katex.min.css?inline'

const BASE_PROSE = `
body{margin:0;background:var(--prose-bg,#fff);}
.preview{color:var(--prose-fg,#111);font-family:var(--prose-font,system-ui,sans-serif);
  max-width:var(--prose-max-width,720px);margin:0 auto;padding:40px 20px;
  line-height:var(--prose-line-height,1.7);}
.preview h1,.preview h2,.preview h3{color:var(--prose-heading,#000);}
.preview a{color:var(--prose-link,#06c);}
.preview code{background:var(--prose-code-bg,#eee);padding:.1em .3em;border-radius:4px;}
.preview pre{background:var(--prose-code-bg,#eee);padding:12px;border-radius:6px;overflow:auto;}
.preview .hljs-keyword,.preview .hljs-built_in,.preview .hljs-type{color:var(--code-keyword,#c678dd);}
.preview .hljs-string,.preview .hljs-attr{color:var(--code-string,#98c379);}
.preview .hljs-comment,.preview .hljs-quote{color:var(--code-comment,#7f848e);font-style:italic;}
.preview .hljs-number,.preview .hljs-literal{color:var(--code-number,#d19a66);}
.preview .hljs-title,.preview .hljs-section{color:var(--code-fn,#61afef);}
.preview .hljs-name,.preview .hljs-tag{color:var(--code-tag,#e06c75);}
`

export function buildStandaloneHtml(bodyHtml: string, themeCss: string, title: string): string {
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>${title}</title>
<style>${themeCss}</style>
<style>${katexCss}</style>
<style>${BASE_PROSE}</style>
</head><body><div class="preview">${bodyHtml}</div></body></html>`
}
```

- [ ] **Step 6: Run to verify pass**

Run:
```bash
npm test 2>&1 | tail -20
```
Expected: PASS — buildStandaloneHtml test green.

- [ ] **Step 7: Wire the Toolbar button**

In `src/components/Toolbar.svelte`, extend the `<script>` with:
```svelte
  import { invoke } from '@tauri-apps/api/core'
  import { content } from '../lib/stores'
  import { renderMarkdown } from '../lib/markdown'
  import { buildStandaloneHtml } from '../lib/export'

  async function openInBrowser() {
    const theme = $themes.find((t) => t.name === $activeThemeName)
    const html = buildStandaloneHtml(
      renderMarkdown($content),
      theme?.css ?? '',
      $currentFile ? baseName($currentFile) : 'Slate',
    )
    await invoke('open_in_browser', { html })
  }
```
Add the button just before the theme `<label>`:
```svelte
  <button class="browser-btn" onclick={openInBrowser}>Open in browser ↗</button>
```

- [ ] **Step 8: Manual verification**

Run `npm run tauri dev`. Open a file, pick a theme, click "Open in browser ↗" → your default browser opens the rendered document styled with the current theme. (Mermaid blocks appear as code in this static export — acceptable for v1; note it.) Close.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat: open current document as themed HTML in the default browser"
```

---

## Task 9: Polish — error surfacing, shortcuts, empty states

**Files:**
- Modify: `src/App.svelte`, `src/styles/base.css`, `src/components/StatusBar.svelte`

- [ ] **Step 1: Auto-clear transient status messages**

In `src/App.svelte` `<script>`, add an effect that clears `statusMsg` after 4s:
```svelte
  import { statusMsg } from './lib/stores'
  let statusTimer: ReturnType<typeof setTimeout> | null = null
  $effect(() => {
    if ($statusMsg) {
      if (statusTimer) clearTimeout(statusTimer)
      statusTimer = setTimeout(() => statusMsg.set(''), 4000)
    }
  })
```
(If `statusMsg` is already imported, don't duplicate the import.)

- [ ] **Step 2: Guard save when no file is open**

Confirm `save()` in `App.svelte` early-returns when `$currentFile` is null (already implemented in Task 3 Step 8). Add a status hint:
```svelte
  // inside save(), replace the `if (!path) return` line with:
  if (!path) { statusMsg.set('Open a file before saving'); return }
```

- [ ] **Step 3: Add an empty-state message in the editor pane**

In `src/App.svelte`, wrap the editor:
```svelte
      <main class="editor-pane" style="flex:{editorFlex}" bind:this={editorPane} onscroll={syncScroll}>
        {#if $currentFile}<Editor />{:else}<div class="empty">Choose a folder, then pick a file to edit.</div>{/if}
      </main>
```

- [ ] **Step 4: Style the empty state and status message**

Append to `src/styles/base.css`:
```css
.empty { padding: 24px; color: var(--fg-muted); }
.statusbar .msg { color: #d9954a; }
.toolbar .browser-btn, .toolbar select { background: var(--bg); color: var(--fg);
  border: 1px solid var(--border); border-radius: 5px; padding: 3px 8px; cursor: pointer; }
.toolbar .theme-label { display: inline-flex; gap: 6px; align-items: center; color: var(--fg-muted); }
```

- [ ] **Step 5: Full manual smoke test**

Run `npm run tauri dev` and verify end-to-end:
- Choose folder → sidebar lists `.md` files.
- Open file → CodeMirror loads it; preview renders (headings, table, task list, code highlight, math, mermaid).
- Edit → "● unsaved"; Ctrl+S → saved.
- Drag divider; scroll-sync works.
- Switch all three themes → whole app restyles; mermaid re-themes.
- Open in browser → themed HTML opens.
- Try saving with no file open → status hint appears and auto-clears.

Close.

- [ ] **Step 6: Run the full test suite**

Run:
```bash
npm test 2>&1 | tail -15 && cd src-tauri && cargo test 2>&1 | tail -15; cd ..
```
Expected: all Vitest specs pass; all Rust tests pass.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: polish — error surfacing, empty state, save guard"
```

---

## Done criteria

- `npm test` and `cargo test` both green.
- `npm run tauri dev` launches Slate; the full smoke test in Task 9 Step 5 passes.
- New themes can be added by dropping a `.css` file (with `/* @name … */`) into
  `%APPDATA%/com.hartye.slate/themes/` and reopening the app — it appears in the dropdown.

## Notes / deferred (per spec "Out of scope")

Tabs/multi-file, find/replace, word count, native PDF export, external-change watching,
plugins, a settings screen beyond the theme dropdown, non-Windows packaging. Mermaid in
the browser export renders as static code (live mermaid only in-app) — revisit if needed.
