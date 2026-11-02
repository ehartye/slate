import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GitHubReleaseApi } from './lib/github-release.mjs';

function manifest(version) {
  const url = name => `https://github.com/ehartye/slate/releases/download/v${version}/${name}`;
  return { version, notes: 'notes', platforms: { 'windows-x86_64': { url: url('a.exe'), signature: 'sig' }, 'darwin-x86_64': { url: url('a.app.tar.gz'), signature: 'sig' }, 'darwin-aarch64': { url: url('a.app.tar.gz'), signature: 'sig' } } };
}
test('feed update uses existing parent/tree and non-forced reference update', async () => {
  const calls = []; let prior = manifest('0.2.0-alpha.1');
  const api = new GitHubReleaseApi('test-token', 'a'.repeat(40), async (url, init) => {
    const path = new URL(url).pathname; const body = init.body && JSON.parse(init.body); calls.push({ path, method: init.method, body });
    let value = {};
    if (path.endsWith('/git/ref/heads/updates')) value = { object: { sha: 'old' } };
    else if (path.endsWith('/git/commits/old')) value = { tree: { sha: 'old-tree' } };
    else if (path.endsWith('/contents/preview.json')) value = { content: Buffer.from(JSON.stringify(prior)).toString('base64') };
    else if (path.endsWith('/git/trees')) value = { sha: 'new-tree' };
    else if (path.endsWith('/git/commits')) value = { sha: 'new-commit' };
    if (init.method === 'PATCH') prior = manifest('0.2.0-alpha.2');
    return new Response(JSON.stringify(value), { status: 200 });
  });
  await api.advanceFeed(manifest('0.2.0-alpha.2'));
  assert.equal(calls.find(c => c.path.endsWith('/git/trees')).body.base_tree, 'old-tree');
  assert.deepEqual(calls.find(c => c.path.endsWith('/git/commits')).body.parents, ['old']);
  assert.deepEqual(calls.find(c => c.method === 'PATCH').body, { sha: 'new-commit', force: false });
});
test('conflicting reference retries re-read feed and refuse newer winner', async () => {
  let reads = 0, writes = 0;
  const api = new GitHubReleaseApi('test-token', 'a'.repeat(40), async (url, init) => {
    const path = new URL(url).pathname;
    if (path.endsWith('/git/ref/heads/updates')) { reads++; return Response.json({ object: { sha: 'old' } }); }
    if (path.endsWith('/git/commits/old')) return Response.json({ tree: { sha: 'tree' } });
    if (path.endsWith('/contents/preview.json')) return Response.json({ content: Buffer.from(JSON.stringify(manifest(reads === 1 ? '0.2.0-alpha.1' : '0.2.0-alpha.3'))).toString('base64') });
    if (init.method === 'PATCH') { writes++; return Response.json({}, { status: 422 }); }
    return Response.json({ sha: 'new' });
  });
  await assert.rejects(api.advanceFeed(manifest('0.2.0-alpha.2')), /regress/);
  assert.equal(reads, 2); assert.equal(writes, 1);
});
test('draft retry discovers authenticated drafts when the by-tag endpoint returns404', async () => {
  const api = new GitHubReleaseApi('test-token', 'a'.repeat(40), async url => {
    const path = new URL(url).pathname;
    if (path.includes('/releases/tags/')) return Response.json({}, { status: 404 });
    return Response.json([{ id: 12, draft: true, tag_name: 'v0.2.0-alpha.2' }]);
  });
  assert.equal((await api.getRelease('v0.2.0-alpha.2')).id, 12);
});
