import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, symlinkSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

test('release helpers remain importable from stdin modules', () => {
  const url = new URL('./validate-release.mjs', import.meta.url).href;
  const result = spawnSync(process.execPath, ['--input-type=module', '-'], {
    input: `import { readReleaseVersions } from ${JSON.stringify(url)}; console.log(typeof readReleaseVersions)`,
    encoding: 'utf8', windowsHide: true,
  });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.trim(), 'function');
});

test('release CLIs execute validation when invoked through a linked directory', () => {
  const root = mkdtempSync(join(tmpdir(), 'slate-cli-link-'));
  try {
    const linked = join(root, 'scripts');
    symlinkSync(fileURLToPath(new URL('.', import.meta.url)), linked, process.platform === 'win32' ? 'junction' : 'dir');
    const help = spawnSync(process.execPath, [join(linked, 'setup-updater-signing.mjs'), '--help'], { encoding: 'utf8', windowsHide: true });
    assert.equal(help.status, 0);
    assert.match(help.stdout, /Usage: node scripts\/setup-updater-signing.mjs/, 'owner setup must also run through a linked path');
    for (const name of ['validate-release.mjs', 'prepare-release-config.mjs', 'check-updater-key.mjs', 'publish-preview.mjs']) {
      const env = { ...process.env, GITHUB_EVENT_NAME: 'test', TAURI_SIGNING_PRIVATE_KEY: '', TAURI_SIGNING_PRIVATE_KEY_PASSWORD: '' };
      const result = spawnSync(process.execPath, [join(linked, name)], { env, encoding: 'utf8', windowsHide: true });
      assert.equal(result.status, 1, `${name} must reject missing inputs instead of silently doing nothing`);
      assert.ok(result.stderr.trim(), `${name} must explain the failure`);
    }
  } finally { rmSync(root, { recursive: true, force: true }); }
});
