// Shortcut labels as the user's own keyboard spells them.
//
// The keydown handler in +page.svelte accepts Ctrl *or* Cmd everywhere, but a
// label should name the one key this machine actually has: "⌘W" on a Mac,
// "Ctrl+W" elsewhere.

export const isMac =
  typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent)

/** Label for a Ctrl/Cmd + `key` shortcut, split into keycaps. */
export function modShortcut(key: string): string[] {
  return [isMac ? '⌘' : 'Ctrl', key]
}
