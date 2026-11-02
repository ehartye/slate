import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { verifyUpdaterSignature } from './lib/updater-signature.mjs';
import { isMain } from './lib/is-main.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
export function checkUpdaterKey(publicKey, env = process.env) {
  if (!env.TAURI_SIGNING_PRIVATE_KEY || !env.TAURI_SIGNING_PRIVATE_KEY_PASSWORD) throw new Error('Updater signing secrets are missing');
  const dir = mkdtempSync(join(tmpdir(), 'slate-key-canary-'));
  try {
    const file = join(dir, 'canary.txt');
    const data = Buffer.from('Slate updater signing-key canary\n');
    writeFileSync(file, data);
    const result = spawnSync(process.execPath, [join(root, 'node_modules/@tauri-apps/cli/tauri.js'), 'signer', 'sign', file], { env, encoding: 'utf8', windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    if (result.error || result.status !== 0) throw new Error('Updater canary signing failed; signer output suppressed');
    verifyUpdaterSignature(data, readFileSync(`${file}.sig`, 'utf8'), publicKey);
  } finally { rmSync(dir, { recursive: true, force: true }); }
}
if (isMain(import.meta.url)) {
  try {
    checkUpdaterKey(readFileSync(join(root, 'src-tauri/updater-public-key.txt'), 'utf8'));
    console.log('Updater signing key matches the public handoff.');
  } catch { console.error('Updater signing canary failed. Check the public handoff and signing secrets. No private output was printed.'); process.exitCode = 1; }
}
