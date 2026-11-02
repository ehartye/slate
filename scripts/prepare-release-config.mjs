import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PREVIEW_ENDPOINT } from './lib/release-contract.mjs';
import { isMain } from './lib/is-main.mjs';

/** Tauri's .pub handoff is base64 wrapping a minisign public-key file.
 * @param {string} input
 */
export function releaseConfig(input) {
  const pubkey = input.trim();
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(pubkey)) throw new Error('Missing or invalid updater public-key handoff');
  const decoded = Buffer.from(pubkey, 'base64');
  if (decoded.toString('base64') !== pubkey) throw new Error('Invalid updater public-key encoding');
  const lines = decoded.toString('utf8').trim().split(/\r?\n/);
  const bytes = Buffer.from(lines[1] ?? '', 'base64');
  if (lines.length !== 2 || !lines[0].startsWith('untrusted comment: ') || bytes.length !== 42 || bytes.toString('base64') !== lines[1] || bytes.subarray(0, 2).toString() !== 'Ed') throw new Error('Invalid updater public-key handoff');
  return { bundle: { createUpdaterArtifacts: true, macOS: { signingIdentity: '-' } }, plugins: { updater: { pubkey, endpoints: [PREVIEW_ENDPOINT] } } };
}

if (isMain(import.meta.url)) {
  try {
    const args = process.argv.slice(2);
    if (args.length !== 2 || args[0] !== '--output') throw new Error('Usage: node scripts/prepare-release-config.mjs --output <temporary-json-path>');
    const root = fileURLToPath(new URL('../', import.meta.url));
    const config = releaseConfig(readFileSync(resolve(root, 'src-tauri/updater-public-key.txt'), 'utf8'));
    writeFileSync(resolve(args[1]), `${JSON.stringify(config, null, 2)}\n`, { flag: 'wx' });
    console.log('Release overlay prepared from the public-key handoff.');
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'Release configuration failed');
    process.exitCode = 1;
  }
}
