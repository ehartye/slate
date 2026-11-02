import { feedDecision } from './release-pipeline.mjs';

const base = 'https://api.github.com/repos/ehartye/slate';
export class GitHubReleaseApi {
  constructor(token, commit, fetcher = fetch) {
    if (!token || !/^[a-f0-9]{40}$/.test(commit)) throw new Error('Missing release token or commit');
    this.token = token; this.commit = commit; this.fetcher = fetcher;
  }
  async request(path, { method = 'GET', body, binary = false, missing = false, upload = false } = {}) {
    const url = upload ? `https://uploads.github.com/repos/ehartye/slate${path}` : `${base}${path}`;
    const response = await this.fetcher(url, { method, headers: { Authorization: `Bearer ${this.token}`, Accept: binary ? 'application/octet-stream' : 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', ...(body ? { 'Content-Type': upload ? 'application/octet-stream' : 'application/json' } : {}) }, body: body ? (upload ? body : JSON.stringify(body)) : undefined, signal: AbortSignal.timeout(120_000) });
    if (missing && response.status === 404) return null;
    if (!response.ok) { const error = new Error(`GitHub request failed (${response.status})`); error.status = response.status; throw error; }
    return binary ? Buffer.from(await response.arrayBuffer()) : response.json();
  }
  async feedSnapshot() {
    const ref = await this.request('/git/ref/heads/updates', { missing: true });
    if (!ref) return { sha: null, tree: null, feed: null };
    const sha = ref.object.sha;
    const commit = await this.request(`/git/commits/${sha}`);
    const file = await this.request(`/contents/preview.json?ref=${sha}`, { missing: true });
    return { sha, tree: commit.tree.sha, feed: file ? JSON.parse(Buffer.from(file.content, 'base64').toString('utf8')) : null };
  }
  async getFeed() { return (await this.feedSnapshot()).feed; }
  async getRelease(tag) {
    const published = await this.request(`/releases/tags/${encodeURIComponent(tag)}`, { missing: true });
    if (published) return published;
    // The by-tag route is documented for published releases. Authenticated
    // listing also exposes unfinished drafts, which a failed upload must resume.
    for (let page = 1; ; page++) {
      const releases = await this.request(`/releases?per_page=100&page=${page}`);
      const match = releases.find(release => release.tag_name === tag);
      if (match) return match;
      if (releases.length < 100) return null;
    }
  }
  createDraft(tag, notes) { return this.request('/releases', { method: 'POST', body: { tag_name: tag, target_commitish: this.commit, name: `Slate ${tag}`, body: notes, draft: true, prerelease: true, make_latest: 'false' } }); }
  listAssets(release) { return this.request(`/releases/${release.id}/assets?per_page=100`); }
  readAsset(asset) { return this.request(`/releases/assets/${asset.id}`, { binary: true }); }
  uploadAsset(release, name, bytes) { return this.request(`/releases/${release.id}/assets?name=${encodeURIComponent(name)}`, { method: 'POST', body: bytes, upload: true }); }
  publishRelease(release) { return this.request(`/releases/${release.id}`, { method: 'PATCH', body: { draft: false, prerelease: true, make_latest: 'false' } }); }
  async verifyPublic(candidate) {
    for (const [name, bytes] of candidate.assets) {
      // No credential on public payload checks. Never trust an API-provided URL.
      const response = await this.fetcher(`https://github.com/ehartye/slate/releases/download/${candidate.tag}/${name}`, { signal: AbortSignal.timeout(120_000) });
      if (!response.ok || !bytes.equals(Buffer.from(await response.arrayBuffer()))) throw new Error(`Published asset unavailable or mismatched: ${name}`);
    }
  }
  async advanceFeed(manifest) {
    for (let attempt = 0; attempt < 3; attempt++) {
      const previous = await this.feedSnapshot();
      if (feedDecision(previous.feed, manifest) === 'unchanged') return;
      const tree = await this.request('/git/trees', { method: 'POST', body: { ...(previous.tree ? { base_tree: previous.tree } : {}), tree: [{ path: 'preview.json', mode: '100644', type: 'blob', content: `${JSON.stringify(manifest, null, 2)}\n` }] } });
      const commit = await this.request('/git/commits', { method: 'POST', body: { message: `Publish Preview ${manifest.version}`, tree: tree.sha, parents: previous.sha ? [previous.sha] : [] } });
      try {
        if (previous.sha) await this.request('/git/refs/heads/updates', { method: 'PATCH', body: { sha: commit.sha, force: false } });
        else await this.request('/git/refs', { method: 'POST', body: { ref: 'refs/heads/updates', sha: commit.sha } });
        const verified = await this.getFeed();
        if (feedDecision(manifest, verified) === 'unchanged') return;
        // A concurrent newer publication is safe; never overwrite it.
        return;
      } catch (error) {
        if (![409, 422].includes(error.status) || attempt === 2) throw error;
      }
    }
  }
}
