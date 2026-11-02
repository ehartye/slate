import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/** Node resolves module URLs through symlinks; argv retains the invoked path.
 * @param {string} moduleUrl
 */
export function isMain(moduleUrl) {
  if (!process.argv[1] || process.argv[1] === '-') return false;
  try {
    return realpathSync(process.argv[1]) === realpathSync(fileURLToPath(moduleUrl));
  } catch {
    // Imported helpers also run under non-file entrypoints (stdin, REPLs, loaders).
    return false;
  }
}
