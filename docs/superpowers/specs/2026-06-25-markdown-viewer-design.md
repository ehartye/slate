# Lightweight Themable Markdown Viewer — Design

**Date:** 2026-06-25
**Status:** Approved design, pending implementation plan

## Purpose

A lightweight, low-memory markdown editor/viewer for Windows that fills the gap left
by quitting VS Code (too memory-heavy). Personal tool, single user. Its defining
feature is a **theme system**: selectable, file-based themes (authored by Claude) that
restyle the entire app — sidebar, editor, and rendered preview — not just the output.

Built as a native shell (Tauri) using the system WebView2 so it stays light: no
bundled Chromium, ~5–10 MB binary, low memory footprint.

## Requirements

Settled during brainstorming:

- **Edit + live preview**, split-pane: raw markdown left, live rendered preview right.
- **Folder sidebar** file model: point the app at a folder, it lists `.md` files, one
  file open at a time.
- **Rendering:** baseline markdown + GFM (tables, task lists, strikethrough), links,
  images (local + remote), plus code **syntax highlighting**, **math (KaTeX)**, and
  **Mermaid diagrams**.
- **Whole-app theming:** one selected theme restyles sidebar, editor, toolbar, and
  preview together. A theme is a single CSS file; users pick from a dropdown.
- **Open in browser:** export the current document to themed standalone HTML and open
  it in the OS default browser (from which the user can print-to-PDF).
- **Windows only** for v1.

## Stack

| Layer | Choice | Rationale |
|---|---|---|
| Shell | Tauri 2 (Rust + Windows WebView2) | Tiny binary, system webview — no bundled Chromium (the reason we avoid Electron) |
| Frontend | Svelte + TypeScript + Vite | Near-zero runtime, clean reactive state for sidebar/dirty/theme |
| Editor | CodeMirror 6 | Lightweight, markdown language mode, themable via the same CSS variables |
| Renderer | markdown-it + plugins | Mature, plugin-based: highlight.js, KaTeX, Mermaid bolt on cleanly |
| File I/O | Tauri Rust commands | Folder listing, file read/write, open-in-browser via the OS |

## Theme System (core feature)

A **theme is one `.css` file** with a name header and a `:root` block setting a fixed
contract of CSS custom properties. The entire app is styled *only* in terms of these
variables, so redefining them restyles everything.

```css
/* @name Midnight */
:root {
  /* chrome */
  --bg; --bg-elevated; --fg; --fg-muted; --border; --accent;
  /* editor */
  --editor-bg; --editor-fg; --editor-font; --editor-selection;
  --syn-heading; --syn-emphasis; --syn-link; --syn-code; --syn-quote;
  /* preview prose */
  --prose-bg; --prose-fg; --prose-font; --prose-heading; --prose-link;
  --prose-code-bg; --prose-max-width; --prose-line-height;
  /* code blocks */
  --code-theme;   /* names a highlight.js theme to load */
}
```

**Theme sources (both listed in the dropdown):**

1. **Bundled defaults** — ship inside the app resources.
2. **User themes** — a folder at `%APPDATA%/<app>/themes/`. New theme files dropped
   here appear in the dropdown **without rebuilding the app**. This is the delivery
   mechanism for new Claude-authored themes.

**Applying a theme:** selecting one swaps the active stylesheet's variable values, sets
the highlight.js code theme named by `--code-theme`, and re-renders Mermaid (so diagram
colors follow the theme).

**Starter themes (authored as part of v1):** "Paper" (warm light reading), "Midnight"
(dark), "Minimal" (clean neutral).

## Architecture

### Rust side (`src-tauri`) — thin I/O layer

Tauri commands:

- `list_markdown_files(folder) -> [path]` — `.md` files in the chosen folder.
- `read_file(path) -> string`
- `write_file(path, content)`
- `list_themes() -> [{ name, css }]` — bundled + user-folder themes, name parsed from
  the `/* @name … */` header.
- `open_in_browser(html)` — write a temp `.html` and open with the OS default browser.
- Folder selection via the Tauri dialog plugin.

### Svelte frontend

Components:

- `App.svelte` — layout shell (toolbar / sidebar / split editor+preview / status bar).
- `Sidebar.svelte` — chosen folder + clickable `.md` list.
- `Editor.svelte` — CodeMirror 6 instance, markdown mode.
- `Preview.svelte` — markdown-it render target; resizable divider, scroll-synced.
- `Toolbar.svelte` — current filename, theme dropdown, "Open in browser" button.
- `StatusBar.svelte` — file path, saved/unsaved indicator, save hint.

Stores: `currentFolder`, `currentFile`, `content`, `dirty`, `themes`, `activeTheme`.

Lib:

- `markdown.ts` — configures markdown-it + highlight.js + KaTeX + Mermaid.
- `theme.ts` — load theme list, parse `@name`, apply variables + code theme.

## Data Flow

1. **Open folder** → `list_markdown_files` → populate sidebar.
2. **Click file** → `read_file` → set CodeMirror doc, `dirty = false`.
3. **Edit** → `content` updates → `dirty = true` → debounced render → preview updates.
4. **Ctrl+S** → `write_file` → `dirty = false`.
5. **Pick theme** → `theme.ts` swaps variables + code theme → re-render Mermaid.
6. **Open in browser** → build standalone HTML (rendered body + inlined active-theme
   CSS + KaTeX/hljs CSS) → `open_in_browser` → OS default browser.

## Error Handling

- File read/write failure → status-bar message; no crash.
- Mermaid / KaTeX parse error → inline error in that block; rest of preview survives.
- Invalid or missing theme file → skip with a console warning; fall back to default.
- v1 is last-write-wins; no external-change watching.

## Testing (TDD)

- **Vitest** — `markdown.ts` (markdown → expected HTML structure for baseline, GFM,
  math, mermaid fences); `theme.ts` (`@name` parse, variable application, fallback).
- **Rust** — command tests against temp directories (list / read / write round-trip).
- **Manual smoke** — live preview and theme switching (webview rendering is not
  unit-testable).

## Build Sequence

Each step is independently verifiable:

1. Scaffold Tauri 2 + Svelte + Vite — window opens.
2. File I/O — folder picker, sidebar lists `.md`, click loads into a textarea, save works.
3. Swap textarea → CodeMirror 6 (markdown mode).
4. Preview pane — markdown-it baseline, debounced, scroll-sync, resizable divider.
5. Render extras — syntax highlighting, KaTeX, Mermaid.
6. Theme system — variable contract, load themes folder, dropdown, apply + 3 starters.
7. Open-in-browser export.
8. Polish — status bar, dirty indicator, keyboard shortcuts, error handling.

## Out of Scope (v1)

Tabs / multi-file, find/replace, word count, native PDF export (browser handles it),
external-change watching, plugin system, settings screen beyond the theme dropdown,
non-Windows packaging.
