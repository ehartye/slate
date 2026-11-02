import { comparePreviewVersions, parsePreviewVersion, validatePreviewManifest } from './release-contract.mjs';
import { verifyUpdaterSignature } from './updater-signature.mjs';

export function makeCandidate(tag, files, publicKey) {
  if (!tag.startsWith('v')) throw new Error('Expected a version tag');
  const version = tag.slice(1); parsePreviewVersion(version);
  const names = [...files.keys()];
  const one = suffix => {
    const matches = names.filter(n => n.endsWith(suffix));
    if (matches.length !== 1) throw new Error(`Expected exactly one ${suffix} asset`);
    return matches[0];
  };
  const exe = one('.exe'), mac = one('.app.tar.gz'), dmg = one('.dmg');
  const required = [exe, `${exe}.sig`, mac, `${mac}.sig`, dmg];
  if (names.length !== required.length || required.some(n => !files.has(n) || !files.get(n).length || !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(n) || n.includes('..'))) throw new Error('Incomplete or unexpected release assets');
  for (const payload of [exe, mac]) verifyUpdaterSignature(files.get(payload), files.get(`${payload}.sig`).toString('utf8').trim(), publicKey);
  const entry = name => ({ url: `https://github.com/ehartye/slate/releases/download/${tag}/${name}`, signature: files.get(`${name}.sig`).toString('utf8').trim() });
  // Omit optional pub_date so retries reproduce identical metadata.
  const manifest = validatePreviewManifest({ version, notes: `Preview ${version}.`, platforms: { 'windows-x86_64': entry(exe), 'darwin-aarch64': entry(mac), 'darwin-x86_64': entry(mac) } });
  const assets = new Map(files);
  assets.set('preview.json', Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`));
  return { tag, manifest, assets };
}

export function feedDecision(existing, next) {
  validatePreviewManifest(next);
  if (!existing) return 'advance';
  validatePreviewManifest(existing);
  const comparison = comparePreviewVersions(next.version, existing.version);
  if (comparison < 0) throw new Error('Refusing to regress the Preview feed');
  if (comparison === 0) {
    if (JSON.stringify(existing) !== JSON.stringify(next)) throw new Error('Equal Preview version has conflicting metadata');
    return 'unchanged';
  }
  return 'advance';
}

/** All network side effects live behind this adapter for failure-order testing. */
export async function publishPreview(candidate, api) {
  const { tag, manifest, assets } = candidate;
  feedDecision(await api.getFeed(), manifest); // reject stale runs before release writes
  let release = await api.getRelease(tag);
  if (!release) release = await api.createDraft(tag, manifest.notes);
  if (release.tag_name !== tag || !release.prerelease || release.body !== manifest.notes) throw new Error('Existing release does not match the Preview candidate');
  const checkAssets = async (allowUpload) => {
    const listed = await api.listAssets(release);
    if (listed.some(a => !assets.has(a.name)) || new Set(listed.map(a => a.name)).size !== listed.length) throw new Error('Unexpected release assets');
    for (const [name, bytes] of assets) {
      const existing = listed.find(a => a.name === name);
      if (existing) {
        if (!bytes.equals(await api.readAsset(existing))) throw new Error(`Immutable asset mismatch: ${name}`);
      } else if (allowUpload) await api.uploadAsset(release, name, bytes);
      else throw new Error(`Missing immutable release asset: ${name}`);
    }
  };
  await checkAssets(release.draft);
  await checkAssets(false); // verify server bytes before exposing the draft
  if (release.draft) await api.publishRelease(release);
  await api.verifyPublic(candidate); // unauthenticated tag-specific URLs must work
  // Re-read and compare inside the adapter as well, immediately before CAS.
  if (feedDecision(await api.getFeed(), manifest) === 'advance') await api.advanceFeed(manifest);
  return manifest;
}
