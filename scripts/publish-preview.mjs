import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { makeCandidate, publishPreview } from './lib/release-pipeline.mjs';
import { GitHubReleaseApi } from './lib/github-release.mjs';
import { isMain } from './lib/is-main.mjs';

export function readAssets(directory) {
  const files = new Map();
  function visit(dir) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) visit(join(dir, entry.name));
      else if (entry.isFile()) {
        if (files.has(entry.name)) throw new Error(`Duplicate artifact name: ${entry.name}`);
        files.set(entry.name, readFileSync(join(dir, entry.name)));
      } else throw new Error('Release artifacts must be regular files');
    }
  }
  visit(directory); return files;
}
if (isMain(import.meta.url)) {
  try {
    if (process.env.GITHUB_REPOSITORY !== 'ehartye/slate' || process.env.GITHUB_EVENT_NAME !== 'push' || process.env.GITHUB_REF_TYPE !== 'tag') throw new Error('Publication requires a Slate tag-push workflow');
    const args = process.argv.slice(2);
    if (args.length !== 2 || args[0] !== '--artifacts') throw new Error('Usage: node scripts/publish-preview.mjs --artifacts <directory>');
    const publicKey = readFileSync(new URL('../src-tauri/updater-public-key.txt', import.meta.url), 'utf8');
    const candidate = makeCandidate(process.env.GITHUB_REF_NAME, readAssets(args[1]), publicKey);
    await publishPreview(candidate, new GitHubReleaseApi(process.env.GITHUB_TOKEN, process.env.GITHUB_SHA));
    console.log(`Preview ${candidate.manifest.version} publication verified.`);
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
