// Line endings, preserved across an edit.
//
// CodeMirror keeps a document as lines and joins them with "\n" when asked for
// its text (`doc.toString()`), whatever separators the file arrived with. So
// a CRLF file that is opened, edited and saved would come back with every one
// of its line endings rewritten — a whole-file diff for a one-character edit,
// and a broken file for formats that care (`.bat`, some `.csv` consumers).
//
// The fix is the conventional one: when text comes off disk, note which line
// ending the file uses and normalize it to "\n" for everything in the app
// (the editor, Preview, export); put that line ending back only at the moment
// of writing to disk.

export type Eol = '\n' | '\r\n'

/** The line ending a file predominantly uses. A file with no line breaks, or
 *  an even split, counts as LF — the editor's own default. Mixed files are
 *  normalized to whichever ending is in the majority on save, which is the
 *  same thing most editors do. */
export function detectEol(text: string): Eol {
  const crlf = text.match(/\r\n/g)?.length ?? 0
  if (crlf === 0) return '\n'
  const lf = (text.match(/\n/g)?.length ?? 0) - crlf
  return crlf > lf ? '\r\n' : '\n'
}

/** `text` with every CRLF (and lone CR) turned into LF. */
export function normalizeEol(text: string): string {
  return text.replace(/\r\n?/g, '\n')
}

/** LF-normalized `text` rewritten to use `eol`, ready to write to disk. */
export function applyEol(text: string, eol: Eol): string {
  return eol === '\n' ? text : text.replace(/\n/g, eol)
}
