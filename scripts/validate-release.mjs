import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateReleaseVersions } from './lib/release-contract.mjs';
import { isMain } from './lib/is-main.mjs';

/** @param {string} root */
export function readReleaseVersions(root) {
  /** @param {string} path */
  const read = path => readFileSync(resolve(root, path), 'utf8');
  const pkg = JSON.parse(read('package.json'));
  const lock = JSON.parse(read('package-lock.json'));
  const cargo = read('src-tauri/Cargo.toml').match(/^\[package\]\s*\n([\s\S]*?)(?=^\[|$(?![\s\S]))/m)?.[1];
  const slate = read('src-tauri/Cargo.lock').split(/^\[\[package\]\]\s*$/m).filter(block => /^name = "slate"$/m.test(block));
  if (slate.length !== 1) throw new Error('Expected one Slate Cargo.lock package');
  return {
    package: pkg.version, lock: lock.version, lockRoot: lock.packages?.['']?.version,
    cargo: cargo?.match(/^version = "([^"]+)"$/m)?.[1] ?? '',
    cargoLock: slate[0].match(/^version = "([^"]+)"$/m)?.[1] ?? '',
    tauri: JSON.parse(read('src-tauri/tauri.conf.json')).version,
  };
}

if (isMain(import.meta.url)) {
  try {
    const args = process.argv.slice(2);
    if (args.length !== 2 || args[0] !== '--tag') throw new Error('Usage: node scripts/validate-release.mjs --tag vMAJOR.MINOR.PATCH-alpha.N');
    const root = fileURLToPath(new URL('../', import.meta.url));
    const version = validateReleaseVersions(args[1], readReleaseVersions(root));
    console.log(`Preview release ${version}: all six version records match.`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'Release validation failed');
    process.exitCode = 1;
  }
}
