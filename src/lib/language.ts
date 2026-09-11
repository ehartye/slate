/** Filling the gaps in `@codemirror/language-data`'s filename matching.
 *
 *  Editor.svelte resolves a file's language through
 *  `LanguageDescription.matchFilename`, which keys off extensions (plus a few
 *  filename patterns). That misses two categories entirely, and both became
 *  much more visible once the sidebar started listing every readable text
 *  file rather than a fixed extension allow-list:
 *
 *  - **Dotfiles.** `.bashrc`, `.env`, `.prettierrc`, `.gitignore` have no
 *    extension to match on — in `Path` terms the leading dot makes the whole
 *    name a stem — so every one of them resolves to nothing.
 *  - **Extensions language-data does not carry**, or carries wrongly.
 *    `.svelte` — this project's own source files — resolves to nothing, and
 *    `.cfg` resolves to *TTCN_CFG*, a telecom test-notation grammar, rather
 *    than anything INI-shaped.
 *
 *  These were measured against the installed `@codemirror/language-data`
 *  rather than assumed; `tests/language.test.ts` pins each one.
 *
 *  Returning `null` means "no opinion — let matchFilename decide", which is
 *  the case for the overwhelming majority of files.
 */

/** Language-data names are matched exactly, so they are spelled here exactly
 *  as that package spells them ("Properties files", not "INI"). */
const SHELL = 'Shell'
const JSON_LANG = 'JSON'
const PROPERTIES = 'Properties files'
const HTML = 'HTML'

/** Whole filenames, lowercased. These are dotfiles with no extension to key
 *  off, so nothing but the full name identifies them. */
const BY_FILENAME: Record<string, string> = {
  // Shell startup files: shell scripts in everything but name.
  '.bashrc': SHELL,
  '.bash_profile': SHELL,
  '.bash_aliases': SHELL,
  '.zshrc': SHELL,
  '.zprofile': SHELL,
  '.profile': SHELL,
  // rc files whose bodies are JSON documents.
  '.prettierrc': JSON_LANG,
  '.eslintrc': JSON_LANG,
  '.babelrc': JSON_LANG,
  // key=value / INI-shaped config.
  '.env': PROPERTIES,
  '.editorconfig': PROPERTIES,
  '.npmrc': PROPERTIES,
  '.yarnrc': PROPERTIES,
  '.gitconfig': PROPERTIES,
  // Ignore files are lists of patterns whose only real syntax is the `#`
  // comment — which is exactly what the Properties grammar highlights.
  '.gitignore': PROPERTIES,
  '.dockerignore': PROPERTIES,
  '.npmignore': PROPERTIES,
  '.gitattributes': PROPERTIES,
}

/** Extensions language-data resolves to something *actively wrong*, which a
 *  correction must therefore beat rather than merely fall back to.
 *
 *  Kept as small as the evidence justifies — one entry. `.cfg` resolves to
 *  TTCN_CFG, a telecom test notation, where a `.cfg` file is INI-shaped in
 *  practice. Anything language-data simply does not know belongs below
 *  instead, as a fallback. */
const CORRECTIONS: Record<string, string> = {
  cfg: PROPERTIES,
}

/** Extensions (without the dot), lowercased — used only when language-data
 *  resolves nothing. */
const BY_EXTENSION: Record<string, string> = {
  // Svelte components are HTML-shaped: markup with <script> and <style>.
  // Not a Svelte grammar, but far better than the nothing it resolves to now.
  svelte: HTML,
  // A bare `.conf` matches nothing. This being a fallback rather than a
  // correction is load-bearing: language-data resolves some conf files by
  // full name — `nginx.conf` is Nginx — and those have to keep winning.
  conf: PROPERTIES,
  env: PROPERTIES,
}

/** Deliberately absent, and why: `Makefile` and `.bat`/`.cmd` have no grammar
 *  in language-data at all. Mapping Makefile to Shell would colour recipe
 *  bodies correctly while mis-colouring targets, macros and the tab-sensitive
 *  structure that actually distinguishes the format — a confidently wrong
 *  highlight reads as a bug in a way that plain text does not. They stay
 *  unhighlighted until a real grammar is available. */

/** The last path segment, lowercased. Windows filenames are case-insensitive,
 *  and language-data's own matching is too. */
function fileNameOf(path: string): string {
  return (path.split(/[\\/]/).pop() ?? path).toLowerCase()
}

/** The extension of `name`, or '' — only when there is a real stem, since
 *  `.bashrc` is a dotfile, not a file with a "bashrc" extension. */
function extensionOf(name: string): string {
  const dot = name.lastIndexOf('.')
  return dot > 0 ? name.slice(dot + 1) : ''
}

/**
 * A language name that must be used *instead of* whatever
 * `LanguageDescription.matchFilename` says, because what it says is wrong.
 * `null` — the overwhelmingly common case — means it has no wrong answer here.
 */
export function languageCorrectionFor(path: string): string | null {
  return CORRECTIONS[extensionOf(fileNameOf(path))] ?? null
}

/**
 * A language name to use only when `matchFilename` resolves nothing at all.
 *
 * Separate from a correction because the two must not be applied at the same
 * point: filling a gap has to happen *after* language-data has had its say,
 * or a blanket extension rule silently outranks a more specific filename
 * match that was right — `.conf` mapped ahead of matchFilename would take
 * `nginx.conf` away from Nginx and give it to Properties.
 */
export function languageFallbackFor(path: string): string | null {
  const name = fileNameOf(path)
  if (name in BY_FILENAME) return BY_FILENAME[name]
  return BY_EXTENSION[extensionOf(name)] ?? null
}
