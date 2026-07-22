# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

**Slate** is a lightweight, themable markdown editor/viewer for the desktop, built with Tauri 2 (Rust shell + system WebView) and a SvelteKit frontend. It runs as a native window using the OS webview (no bundled Chromium), so it stays small and low-memory. Single user, one file open at a time, point-at-a-folder file model.

Note: the package/crate are still named `scaffold` (from the Tauri template); the product is `Slate` (`tauri.conf.json`, identifier `com.hartye.slate`). Don't rename to "match" — they're intentionally distinct.

Design and plan docs live in `docs/superpowers/` — read `specs/2026-06-25-markdown-viewer-design.md` for the original architecture and the explicit v1 out-of-scope list before adding features.

## Commands

```bash
npm run tauri dev      # run the full desktop app (Rust + webview); use this to see real behavior
npm run dev            # vite-only frontend on :1420 (no Tauri backend — invoke() calls reject)
npm run build          # build frontend to ./build (adapter-static SPA)
npm test               # vitest run — frontend unit tests (tests/*.test.ts)
npm test -- export     # run a single test file by name fragment
npm run check          # svelte-check typecheck

# Rust backend (run inside src-tauri/)
cargo test             # files.rs unit tests (markdown listing, link resolution, theme header parsing)
cargo build            # compile the Rust shell
```

There is no lint step configured. `npm run check` is the typecheck gate.

## Architecture

The app is two layers talking over Tauri's `invoke`/`emit` bridge.

### Rust shell (`src-tauri/src/`) — thin I/O layer

- `lib.rs` — the real entry point (`run()`); `main.rs` just calls it. Registers all `#[tauri::command]`s in `invoke_handler!`, manages two pieces of state (`OpenedFile`, `FileWatcher`), and seeds themes on `setup`.
- `files.rs` — pure, unit-tested helpers: markdown file listing, PDF file listing (`pdf_files_in`/`is_pdf`, alongside the general-text-file listing used by "Markdown only" mode off), `is_launch_openable` (markdown or PDF — the set of extensions this app is registered to be opened with), relative `.md` link resolution (with Windows `\\?\` verbatim-prefix stripping), and parsing theme CSS headers (`@name`, `@mode`, `--accent`, `--bg`).
- `win_icon.rs` — Windows-specific window icon handling.

Commands exposed to the frontend (see `src/lib/tauri.ts` and `theme.ts` for the typed wrappers): `list_markdown_files`, `list_text_files`, `read_file`, `read_pdf_as_data_url`, `write_file`, `watch_file`/`unwatch_file`, `get_startup_file`, `list_themes`, `open_in_browser`, `set_window_icon`.

**File-open associations** are handled differently per OS and this is easy to break: Windows delivers the launch file as a CLI arg (read in `get_startup_file`); macOS delivers it via Apple Events (`RunEvent::Opened` in `run()`'s callback) into `OpenedFile` state and/or an `open-file` event. The frontend reconciles both in `+page.svelte`'s `onMount`. Both paths gate on `files::is_launch_openable` (`.md`/`.markdown`/`.pdf`), which must stay in sync with `tauri.conf.json`'s `bundle.fileAssociations` — that's what puts Slate in the OS "Open With" list (macOS: `CFBundleDocumentTypes` in the generated `Info.plist`; Windows: NSIS-installer registry entries). The PDF entry uses `"role": "Viewer"` and `"rank": "Alternate"` (`LSHandlerRank` on macOS) deliberately — Slate is a secondary viewer, not the file's primary owner, so it appears as an "Open With" option without becoming the default double-click handler or displacing whatever already is (verified via `lsregister -dump`: Slate's PDF claim shows `rank: Alternate` alongside the system's existing `Default`-rank PDF openers, untouched).

**External-change watching:** `watch_file` debounces filesystem events on the file's *parent dir* (to catch atomic-rename saves) and emits `file-changed`. The frontend's own saves set a `suppressNextChange` flag so the app doesn't treat its own write as an external edit. If the buffer is dirty, an external change shows a warning instead of clobbering edits.

### SvelteKit frontend (`src/`)

Svelte 5 (runes: `$state`, `$effect`, `$derived`), SPA mode via `adapter-static` with `fallback: index.html` (Tauri has no SSR server). Single route: `src/routes/+page.svelte` is the layout shell wiring together the components.

- `lib/stores.ts` — all shared state as Svelte writable stores (`content`, `currentFile`, `currentFolder`, `dirty`, theme stores, layout-collapse flags, `previewZoom`, `editorScroll`, `reloadTrigger`). Start here to understand cross-component state.
- `lib/components/Editor.svelte` — CodeMirror 6 in markdown mode. Source-syntax highlighting is defined via a `HighlightStyle` whose colors are `var(--…)` so the editor follows the active theme.
- `lib/components/Preview.svelte` — debounced (120ms) markdown render, mermaid rendering pass, and link interception (in-page anchors scroll, http/mailto open in system browser, relative `.md` links resolve via `resolve_md_link` and load in-app).
- `lib/markdown.ts` — the single `markdown-it` instance with all plugins (task lists, footnotes, anchors+TOC, mark/sup/sub/kbd, GitHub alerts, KaTeX) plus highlight.js fence highlighting and front-matter → metadata-card rendering. Mermaid fences are emitted as `<pre class="mermaid">` for Preview to render.
- `lib/theme.ts` / `lib/export.ts` / `lib/zoom.ts` / `lib/icon.ts` — theme apply/persist, standalone-HTML export for "Open in browser", preview zoom (persisted), and dynamic app-icon generation from the theme.
- `lib/components/PdfViewer.svelte` — PDF tab rendering, via a dynamically-imported `pdfjs-dist` (Vite code-splits it into its own chunk, so its cost is paid only when a PDF tab is actually opened). Continuous vertical scroll through every page (one `<canvas>` each), lazily rendered as each page's container scrolls near the viewport via a shared `IntersectionObserver` — `lib/pdfLayout.ts` holds the pure zoom/layout math (fit-width/fit-page scale, "current page" from visibility ratios), `lib/pdfLinks.ts` holds the pure link-annotation math (PDF-rect-to-on-screen-percentage conversion, destination-to-page-number resolution) — both unit-tested separately from the component's pdf.js/DOM orchestration. Toolbar has page-nav (scrolls to a page), Width/Page fit-mode toggles, manual zoom, and a table-of-contents toggle (`lib/components/PdfOutline.svelte`, a recursive component — components self-import for recursion in Svelte 5, `<svelte:self>` is legacy — built from `doc.getOutline()`, hidden when a PDF has none). Hyperlinks (both external URLs and internal same-document links) render as absolutely-positioned `<a>` overlays per page, positioned in page-relative *percentages* so they stay correctly placed at any zoom with no recomputation; external links open via `openUrl` from `@tauri-apps/plugin-opener` (same policy as Preview.svelte's markdown links — never inside the app's own webview), internal links resolve their destination to a page number and scroll to it. A PDF isn't text, so PDF tabs skip CodeMirror/Editor.svelte entirely: `+page.svelte` hides the whole Editor pane and rail when the active tab is a PDF (`isPdfPath($currentFile)`) and shows `PdfViewer` full-width in the preview pane instead of `Preview`. Content flows through a dedicated `pdfDataUrl` store (a `data:` URL from the `read_pdf_as_data_url` command, decoded to bytes via `atob()` before handing to pdf.js — passing the `data:` URL itself as pdf.js's `url` param doesn't work) and a `pdfCache` map in `tabs.ts`, kept separate from `content`/the text-tab cache so nothing that reads `content` (Preview's markdown pipeline, Save, "Open in browser") ever has to guard against it holding a large base64 blob.

### The theme system (core feature)

A theme is **one `.css` file** with a header comment (`/* @name X */`, `/* @mode light|dark */`) and a `:root` block defining a fixed contract of CSS custom properties. The **entire app is styled only in terms of these variables** (chrome, editor, preview prose, and `--code-*` highlight tokens), so swapping the variable values restyles everything at once — including CodeMirror source highlighting and the regenerated window icon.

- Bundled starter themes live in `src-tauri/themes/*.css`, compiled in via `include_str!` in `lib.rs`'s `STARTER_THEMES` array.
- On startup `seed_themes` writes them to `%APPDATA%/com.hartye.slate/themes/` (or OS equivalent), **refreshing bundled themes when their content changes** but never touching user-authored files. `RETIRED_STARTERS` deletes obsolete bundled filenames.
- `list_themes` reads that directory at runtime, so dropping a new `.css` there adds a theme without rebuilding.

**To add or edit a bundled theme:** add the file to `src-tauri/themes/`, register it in `STARTER_THEMES` in `lib.rs`, and give the family a `META` entry in `ThemePanel.svelte`. Keep the full variable contract complete (`src/lib/styles/prose.css` — shared by the in-app preview and the browser export — is the source of truth for which `--code-*` highlight tokens themes are expected to define). `dark`-mode themes also drive mermaid's base theme. App-bundled fonts referenced by a theme's font variables are inlined into the browser export automatically (`collectThemeFontCss`); system-installed fonts (e.g. Nerd Fonts) are referenced by name and fall back gracefully.

## Conventions

- Line endings are forced to **LF** via `.gitattributes` (Windows tooling kept rewriting `Cargo.toml` to CRLF). Don't reintroduce CRLF.
- Frontend errors are surfaced to the user via the `statusMsg` store (auto-clears after 4s), not thrown/alerted. Tauri `invoke` calls that may run outside a Tauri context (e.g. plain `vite dev`) are wrapped in try/catch and degrade silently.
- New backend logic that's pure (parsing, path math) goes in `files.rs` with a unit test; command handlers in `lib.rs` stay thin.
- `tauri.conf.json`'s `security.csp` is enforced only in production (`tauri build`); it's not exercised by `tauri dev`, which serves the raw Vite dev response instead of the compile-time-hashed bundle. Test CSP changes against a real build. `style-src` needs `'unsafe-inline'` — the theme system injects an active theme's CSS via `style.textContent` at runtime (`theme.ts`), which compile-time hashing can't cover, and mermaid/KaTeX do the same for their own dynamic styles.
