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

/** Extensions (without the dot), lowercased. */
const BY_EXTENSION: Record<string, string> = {
  // Svelte components are HTML-shaped: markup with <script> and <style>.
  // Not a Svelte grammar, but far better than the nothing it resolves to now.
  svelte: HTML,
  // language-data sends .cfg to TTCN_CFG, a telecom test notation. In
  // practice a .cfg file is INI-shaped, as is .conf, which matches nothing.
  cfg: PROPERTIES,
  conf: PROPERTIES,
  env: PROPERTIES,
}

/** Deliberately absent, and why: `Makefile` and `.bat`/`.cmd` have no grammar
 *  in language-data at all. Mapping Makefile to Shell would colour recipe
 *  bodies correctly while mis-colouring targets, macros and the tab-sensitive
 *  structure that actually distinguishes the format — a confidently wrong
 *  highlight reads as a bug in a way that plain text does not. They stay
 *  unhighlighted until a real grammar is available. */

/**
 * The language-data language name to use for `path`, or `null` to defer to
 * `LanguageDescription.matchFilename`.
 *
 * Accepts a full path or a bare filename; only the last segment is consulted.
 * Matching is case-insensitive because Windows filenames are.
 */
export function languageNameFor(path: string): string | null {
  const name = (path.split(/[\\/]/).pop() ?? path).toLowerCase()
  if (name in BY_FILENAME) return BY_FILENAME[name]

  // Take the last dot segment, but only when the name has a real stem —
  // `.bashrc` is a dotfile, not a file with a "bashrc" extension.
  const dot = name.lastIndexOf('.')
  if (dot > 0) {
    const ext = name.slice(dot + 1)
    if (ext in BY_EXTENSION) return BY_EXTENSION[ext]
  }
  return null
}
