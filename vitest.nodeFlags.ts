/**
 * Whether this Node needs `--no-webstorage` to run the localStorage suites.
 *
 * Node 25 turned the Web Storage API on by default, which shadows jsdom's
 * localStorage with a prototype-less stub (see CLAUDE.md). The flag that turns
 * it back off only exists from 25 up: passing it to Node 24 aborts the entire
 * run with `bad option: --no-webstorage` before a single test executes, so the
 * flag has to be conditional rather than unconditional.
 *
 * @param nodeVersion `process.versions.node` (a leading `v` is tolerated).
 */
export function needsNoWebStorage(nodeVersion: string): boolean {
  const major = Number(nodeVersion.replace(/^v/, '').split('.')[0])
  return major >= 25
}
