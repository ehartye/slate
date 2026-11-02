import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, createHash, sign } from 'node:crypto';
import { makeCandidate, publishPreview } from './lib/release-pipeline.mjs';
import { verifyUpdaterSignature } from './lib/updater-signature.mjs';
import { checkUpdaterKey } from './check-updater-key.mjs';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

function keys() {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const id = Buffer.alloc(8, 7);
  const raw = publicKey.export({ format: 'der', type: 'spki' }).subarray(-32);
  const pub = Buffer.from(`untrusted comment: test\n${Buffer.concat([Buffer.from('Ed'), id, raw]).toString('base64')}\n`).toString('base64');
  return { pub, signature(data) {
    const sig = sign(null, createHash('blake2b512').update(data).digest(), privateKey);
    const comment = 'test only';
    const global = sign(null, Buffer.concat([sig, Buffer.from(comment)]), privateKey);
    return Buffer.from(`untrusted comment: test\n${Buffer.concat([Buffer.from('ED'), id, sig]).toString('base64')}\ntrusted comment: ${comment}\n${global.toString('base64')}\n`).toString('base64');
  } };
}
const key = keys();
function files() {
  const exe = Buffer.from('windows'), mac = Buffer.from('mac');
  return new Map([['Slate_setup.exe', exe], ['Slate_setup.exe.sig', Buffer.from(key.signature(exe))], ['Slate.app.tar.gz', mac], ['Slate.app.tar.gz.sig', Buffer.from(key.signature(mac))], ['Slate.dmg', Buffer.from('dmg')]]);
}
function candidate(version = '0.2.0-alpha.2') { return makeCandidate(`v${version}`, files(), key.pub); }
function fake({ feed = null, release = null, failUpload = false, failPublic = false } = {}) {
  const calls = []; const assets = new Map();
  return { calls, assets, feed, release,
    async getFeed() { return this.feed; },
    async getRelease() { return this.release; },
    async createDraft(tag, notes) { calls.push('create'); return this.release = { id: 1, tag_name: tag, body: notes, draft: true, prerelease: true }; },
    async listAssets() { return [...assets.keys()].map(name => ({ name })); },
    async readAsset(asset) { return assets.get(asset.name); },
    async uploadAsset(_, name, bytes) { calls.push(`upload:${name}`); if (failUpload) throw Error('upload failed'); assets.set(name, bytes); },
    async publishRelease() { calls.push('publish'); this.release.draft = false; },
    async verifyPublic() { calls.push('public'); if (failPublic) throw Error('not public'); },
    async advanceFeed(value) { calls.push('feed'); this.feed = value; },
  };
}
test('canary verification rejects mismatched keys, changed payload and changed trusted comment', () => {
  const data = Buffer.from('canary'); const sig = key.signature(data);
  verifyUpdaterSignature(data, sig, key.pub);
  assert.throws(() => verifyUpdaterSignature(data, sig, keys().pub));
  assert.throws(() => verifyUpdaterSignature(Buffer.from('tampered'), sig, key.pub));
  const changed = Buffer.from(Buffer.from(sig, 'base64').toString().replace('test only', 'changed')).toString('base64');
  assert.throws(() => verifyUpdaterSignature(data, changed, key.pub));
});
test('missing signing secrets fail before any signer process is started', () => {
  assert.throws(() => checkUpdaterKey(key.pub, {}), /missing/);
});
test('real installed Tauri signer canary matches and rejects a different public key', () => {
  // Disposable test key only. All native output is captured, never printed.
  const dir = mkdtempSync(join(tmpdir(), 'slate-signature-test-'));
  try {
    const file = join(dir, 'test.key');
    const password = 'disposable-test-only';
    const result = spawnSync(process.execPath, ['node_modules/@tauri-apps/cli/tauri.js', 'signer', 'generate', '--ci', '--write-keys', file, `--password=${password}`], { encoding: 'utf8', windowsHide: true });
    assert.equal(result.status, 0, 'Disposable Tauri key generation failed (output suppressed)');
    const env = { ...process.env, TAURI_SIGNING_PRIVATE_KEY: readFileSync(file, 'utf8'), TAURI_SIGNING_PRIVATE_KEY_PASSWORD: password };
    delete env.TAURI_SIGNING_PRIVATE_KEY_PATH;
    checkUpdaterKey(readFileSync(`${file}.pub`, 'utf8'), env);
    assert.throws(() => checkUpdaterKey(key.pub, env), /mismatch|verification/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
test('requires all installers and signatures, verifies signatures, creates complete universal feed', () => {
  const c = candidate();
  assert.deepEqual(Object.keys(c.manifest.platforms).sort(), ['darwin-aarch64', 'darwin-x86_64', 'windows-x86_64']);
  assert.deepEqual(c.manifest.platforms['darwin-aarch64'], c.manifest.platforms['darwin-x86_64']);
  assert.match(c.manifest.platforms['windows-x86_64'].url, /\/download\/v0.2.0-alpha.2\//);
  for (const name of files().keys()) { const missing = files(); missing.delete(name); assert.throws(() => makeCandidate('v0.2.0-alpha.2', missing, key.pub)); }
  const bad = files(); bad.set('Slate_setup.exe', Buffer.from('tamper')); assert.throws(() => makeCandidate('v0.2.0-alpha.2', bad, key.pub));
});
test('publishes only complete checked draft and verifies public assets before feed', async () => {
  const api = fake(); const c = candidate(); await publishPreview(c, api);
  assert.equal(api.assets.size, 6);
  assert.ok(api.calls.indexOf('publish') > api.calls.indexOf('upload:preview.json'));
  assert.deepEqual(api.calls.slice(-3), ['publish', 'public', 'feed']);
  assert.deepEqual(api.feed, c.manifest);
});
test('partial upload or public-asset failure preserves previous feed', async () => {
  for (const failure of [{ failUpload: true }, { failPublic: true }]) {
    const prior = candidate('0.2.0-alpha.1').manifest; const api = fake({ feed: prior, ...failure });
    await assert.rejects(publishPreview(candidate(), api));
    assert.deepEqual(api.feed, prior); assert.ok(!api.calls.includes('feed'));
  }
});
test('older run and conflicting equal feed never publish or regress feed', async () => {
  for (const prior of [candidate('0.2.0-alpha.3').manifest, { ...candidate().manifest, notes: 'different' }]) {
    const api = fake({ feed: prior }); await assert.rejects(publishPreview(candidate(), api)); assert.deepEqual(api.calls, []);
  }
});
test('matching published release/feed retry is a no-op; changed assets are never replaced', async () => {
  const c = candidate(); const api = fake(); await publishPreview(c, api); api.calls.length = 0;
  await publishPreview(c, api); assert.ok(!api.calls.some(x => /upload|publish|feed|create/.test(x)));
  api.assets.set('Slate.dmg', Buffer.from('changed')); api.calls.length = 0;
  await assert.rejects(publishPreview(c, api), /immutable/i); assert.deepEqual(api.calls, []);
});
test('draft retry adds only missing assets and never replaces existing mismatches', async () => {
  const c = candidate(); const api = fake({ release: { id: 1, tag_name: c.tag, body: c.manifest.notes, draft: true, prerelease: true } });
  api.assets.set('Slate.dmg', c.assets.get('Slate.dmg')); await publishPreview(c, api);
  assert.ok(!api.calls.includes('upload:Slate.dmg'));
  const bad = fake({ release: { ...api.release, draft: true } }); bad.assets.set('Slate.dmg', Buffer.from('different'));
  await assert.rejects(publishPreview(c, bad), /immutable/i);
});
